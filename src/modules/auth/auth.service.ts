import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { generateSecureOtp } from '../../common/utils/crypto.util';
import { User } from './entities/user.entity';
import {
  RegisterDto,
  VerifyOtpDto,
  LoginDto,
  ResendOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { UserRepository } from './repositories/user.repository';
import { WalletBalanceRepository } from '../wallet/repositories/wallet-balance.repository';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import {
  MAIL_PROVIDER,
  MailProvider,
} from '../../common/interfaces/mail-provider.interface';
import {
  EmailAlreadyExistsException,
  InvalidOtpException,
  OtpExpiredException,
  BusinessException,
} from '../../common/filters/business-exception';
import { JwtPayload } from './strategies/jwt.strategy';
import { ResponseHelper } from '../../common/helpers/response.helper';
import { SUPPORTED_CURRENCIES, Role, Currency } from '../../common/enums';
import { ConfigService } from '@nestjs/config';
import { WalletBalance } from '../wallet/entities/wallet-balance.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly OTP_TTL = 600;
  private readonly OTP_MAX_ATTEMPTS = 5;
  private readonly OTP_ATTEMPTS_TTL = 900;
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly walletBalanceRepository: WalletBalanceRepository,
    private readonly jwtService: JwtService,
    private readonly redisCache: RedisCacheService,
    private readonly dataSource: DataSource,
    @Inject(MAIL_PROVIDER)
    private readonly mailProvider: MailProvider,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.userRepository.findByEmail(dto.email);

    if (existingUser) {
      throw new EmailAlreadyExistsException();
    }

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = queryRunner.manager.create(User, {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        isVerified: false,
        role: Role.USER,
      });

      const savedUser = await queryRunner.manager.save(user);

      const wallets = SUPPORTED_CURRENCIES.map((currency: Currency) =>
        queryRunner.manager.create(WalletBalance, {
          userId: savedUser.id,
          currency,
          balance: 0,
        }),
      );

      await queryRunner.manager.save(wallets);
      await queryRunner.commitTransaction();
      await this.generateAndSendOtp(savedUser);

      return ResponseHelper.success(
        {
          userId: savedUser.id,
          email: savedUser.email,
        },
        'Registration successful. Please check your email for OTP verification.',
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userRepository.findByEmail(dto.email);

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

    await this.userRepository.markAsVerified(user.id);
    await this.redisCache.del(otpKey);
    await this.redisCache.del(attemptsKey);

    user.isVerified = true;

    const { accessToken, refreshToken } = await this.generateTokens(user);
    const balances = await this.walletBalanceRepository.getBalanceMap(user.id);

    return ResponseHelper.success(
      {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isVerified: user.isVerified,
          role: user.role,
        },
        walletBalances: balances,
      },
      'Email verified successfully.',
    );
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findByEmail(dto.email);

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

    const { accessToken, refreshToken } = await this.generateTokens(user);
    const balances = await this.walletBalanceRepository.getBalanceMap(user.id);

    return ResponseHelper.success(
      {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isVerified: user.isVerified,
          role: user.role,
        },
        walletBalances: balances,
      },
      'Login successful.',
    );
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.userRepository.findByEmail(dto.email);

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

  async refreshToken(userId: string, refreshToken: string) {
    const user = await this.userRepository.findById(userId);

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshTokenHash,
    );

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Access denied');
    }

    const tokens = await this.generateTokens(user);

    return ResponseHelper.success(tokens, 'Token refreshed successfully.');
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepository.findByEmail(dto.email);

    if (!user) {
      return ResponseHelper.success(
        null,
        'If your email is registered, a password reset OTP has been sent.',
      );
    }

    const otp = generateSecureOtp();
    const otpKey = `pwd_reset:${user.id}`;
    await this.redisCache.set(otpKey, otp, this.OTP_TTL);

    try {
      await this.mailProvider.sendMail({
        to: user.email,
        subject: 'FX Trading - Password Reset',
        html: `
          <h2>Password Reset Request</h2>
          <p>Hello ${user.firstName},</p>
          <p>Your password reset OTP is:</p>
          <h1 style="letter-spacing: 8px; font-size: 32px; color: #333;">${otp}</h1>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request this, please ignore this email.</p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send reset OTP email to ${user.email}`,
        (error as Error).stack,
      );
    }

    return ResponseHelper.success(
      null,
      'If your email is registered, a password reset OTP has been sent.',
    );
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userRepository.findByEmail(dto.email);

    if (!user) {
      throw new InvalidOtpException();
    }

    const otpKey = `pwd_reset:${user.id}`;
    const storedOtp = await this.redisCache.get(otpKey);

    if (!storedOtp) {
      throw new OtpExpiredException();
    }

    if (storedOtp !== dto.otp) {
      throw new InvalidOtpException();
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);
    await this.userRepository.updatePassword(user.id, passwordHash);
    await this.redisCache.del(otpKey);

    return ResponseHelper.success(
      null,
      'Password has been reset successfully. You can now log in.',
    );
  }

  private async generateAndSendOtp(user: User): Promise<void> {
    const otp = generateSecureOtp();
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

  private async generateTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      isVerified: user.isVerified,
      role: user.role,
    };

    const accessTokenSecret = this.configService.get<string>('jwt.secret');
    const accessTokenExp = this.configService.get<number>('jwt.expiration');
    const refreshTokenSecret =
      this.configService.get<string>('jwt.refreshSecret');
    const refreshTokenExp = this.configService.get<number>(
      'jwt.refreshExpiration',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessTokenSecret,
        expiresIn: accessTokenExp,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshTokenSecret,
        expiresIn: refreshTokenExp,
      }),
    ]);

    const refreshTokenHash = await bcrypt.hash(refreshToken, this.SALT_ROUNDS);
    await this.userRepository.updateRefreshTokenHash(user.id, refreshTokenHash);

    return { accessToken, refreshToken };
  }
}
