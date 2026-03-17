import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { RegisterDto, VerifyOtpDto, LoginDto, ResendOtpDto } from './dto';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { MAIL_PROVIDER } from '../../common/interfaces/mail-provider.interface';
import {
  EmailAlreadyExistsException,
  InvalidOtpException,
  OtpExpiredException,
  BusinessException,
} from '../../common/filters/business-exception';
import { JwtPayload } from './strategies/jwt.strategy';
import { ResponseHelper } from '../../common/helpers/response.helper';
import { WalletBalance } from '../wallet/entities/wallet-balance.entity';
import { SUPPORTED_CURRENCIES, Currency } from '../../common/enums';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly OTP_TTL = 600;
  private readonly OTP_MAX_ATTEMPTS = 5;
  private readonly OTP_ATTEMPTS_TTL = 900;
  private readonly SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(WalletBalance)
    private readonly walletRepository: Repository<WalletBalance>,
    private readonly jwtService: JwtService,
    private readonly redisCache: RedisCacheService,
    @Inject(MAIL_PROVIDER)
    private readonly mailProvider: {
      sendMail: (options: any) => Promise<void>;
      getProviderName: () => string;
    },
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new EmailAlreadyExistsException();
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = this.userRepository.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      isVerified: false,
    });

    await this.userRepository.save(user);
    await this.seedWalletBalances(user.id);
    await this.generateAndSendOtp(user);

    return ResponseHelper.success(
      {
        userId: user.id,
        email: user.email,
      },
      'Registration successful. Please check your email for OTP verification.',
    );
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new InvalidOtpException();
    }

    if (user.isVerified) {
      return ResponseHelper.success(
        { email: user.email },
        'Email is already verified.',
      );
    }

    const attemptsKey = `otp:attempts:${user.id}`;
    const attempts = await this.redisCache.get(attemptsKey);
    if (attempts && parseInt(attempts, 10) >= this.OTP_MAX_ATTEMPTS) {
      throw new BusinessException(
        'Too many OTP attempts. Please request a new OTP.',
        'AUTH_OTP_MAX_ATTEMPTS',
      );
    }

    const otpKey = `otp:${user.id}`;
    const storedOtp = await this.redisCache.get(otpKey);

    if (!storedOtp) {
      throw new OtpExpiredException();
    }

    if (storedOtp !== dto.otp) {
      const currentAttempts = await this.redisCache.incr(attemptsKey);
      if (currentAttempts === 1) {
        await this.redisCache.expire(attemptsKey, this.OTP_ATTEMPTS_TTL);
      }
      throw new InvalidOtpException();
    }

    user.isVerified = true;
    await this.userRepository.save(user);
    await this.redisCache.del(otpKey);
    await this.redisCache.del(attemptsKey);

    const token = this.generateToken(user);
    const balances = await this.getUserBalances(user.id);

    return ResponseHelper.success(
      {
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isVerified: user.isVerified,
        },
        walletBalances: balances,
      },
      'Email verified successfully.',
    );
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new BusinessException(
        'Invalid email or password.',
        'AUTH_INVALID_CREDENTIALS',
        401,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BusinessException(
        'Invalid email or password.',
        'AUTH_INVALID_CREDENTIALS',
        401,
      );
    }

    if (!user.isVerified) {
      await this.generateAndSendOtp(user);

      return ResponseHelper.success(
        {
          isVerified: false,
          email: user.email,
        },
        'Account not verified. A new OTP has been sent to your email.',
      );
    }

    const token = this.generateToken(user);
    const balances = await this.getUserBalances(user.id);

    return ResponseHelper.success(
      {
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isVerified: user.isVerified,
        },
        walletBalances: balances,
      },
      'Login successful.',
    );
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      return ResponseHelper.success(
        null,
        'If the email is registered, a new OTP has been sent.',
      );
    }

    if (user.isVerified) {
      return ResponseHelper.success(
        { email: user.email },
        'Email is already verified.',
      );
    }
    await this.redisCache.del(`otp:attempts:${user.id}`);

    await this.generateAndSendOtp(user);

    return ResponseHelper.success(
      null,
      'If the email is registered, a new OTP has been sent.',
    );
  }

  private async generateAndSendOtp(user: User): Promise<void> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpKey = `otp:${user.id}`;

    await this.redisCache.set(otpKey, otp, this.OTP_TTL);

    try {
      await this.mailProvider.sendMail({
        to: user.email,
        subject: 'FX Trading - Email Verification OTP',
        html: `
          <h2>Email Verification</h2>
          <p>Hello ${user.firstName},</p>
          <p>Your OTP verification code is:</p>
          <h1 style="letter-spacing: 8px; font-size: 32px; color: #333;">${otp}</h1>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request this, please ignore this email.</p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${user.email}`,
        (error as Error).stack,
      );
    }
  }

  private generateToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      isVerified: user.isVerified,
    };

    return this.jwtService.sign(payload);
  }

  private async seedWalletBalances(userId: string): Promise<void> {
    const wallets = SUPPORTED_CURRENCIES.map((currency) =>
      this.walletRepository.create({
        userId,
        currency,
        balance: 0,
      }),
    );
    await this.walletRepository.save(wallets);
  }

  private async getUserBalances(
    userId: string,
  ): Promise<Record<string, number>> {
    const balances = await this.walletRepository.find({
      where: { userId },
      order: { currency: 'ASC' },
    });

    const balanceMap: Record<string, number> = {};
    for (const balance of balances) {
      balanceMap[balance.currency] = Number(balance.balance);
    }
    return balanceMap;
  }
}
