import { Injectable, Logger } from '@nestjs/common';
import { UserRepository } from '../auth/repositories/user.repository';
import { WalletBalanceRepository } from '../wallet/repositories/wallet-balance.repository';
import { TransactionRepository } from '../transactions/repositories/transaction.repository';
import { ResponseHelper } from '../../common/helpers/response.helper';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Role } from '../../common/enums';
import { BusinessException } from '../../common/filters/business-exception';
import { HttpStatus } from '@nestjs/common';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly walletBalanceRepository: WalletBalanceRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async getUsers(pagination: PaginationQueryDto, email?: string, role?: Role) {
    const { page, limit, sortOrder } = pagination;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
        'user.role',
        'user.isVerified',
        'user.createdAt',
      ]);

    if (email) {
      qb.andWhere('user.email ILIKE :email', { email: `%${email}%` });
    }

    if (role) {
      qb.andWhere('user.role = :role', { role });
    }

    const totalItems = await qb.getCount();

    const skip = (page - 1) * limit;
    const users = await qb
      .orderBy('user.created_at', sortOrder)
      .skip(skip)
      .take(limit)
      .getMany();

    const totalPages = Math.ceil(totalItems / limit);

    const formatted = users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isVerified: u.isVerified,
      createdAt: u.createdAt,
    }));

    return ResponseHelper.paginated(
      formatted,
      { page, limit, totalItems, totalPages },
      'Users retrieved successfully.',
    );
  }

  async getUserById(userId: string) {
    const user = await this.userRepository.findByIdWithRelations(userId, [
      'walletBalances',
    ]);

    if (!user) {
      throw new BusinessException(
        `User ${userId} not found.`,
        'USER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return ResponseHelper.success(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        walletBalances: user.walletBalances.map((wb) => ({
          currency: wb.currency,
          balance: Number(wb.balance),
        })),
      },
      'User retrieved successfully.',
    );
  }

  async updateUserRole(userId: string, newRole: Role) {
    if (!Object.values(Role).includes(newRole)) {
      throw new BusinessException(
        `Invalid role: ${newRole}. Must be one of: ${Object.values(Role).join(', ')}`,
        'INVALID_ROLE',
      );
    }

    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new BusinessException(
        `User ${userId} not found.`,
        'USER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.userRepository.update(userId, { role: newRole } as any);

    this.logger.log(
      `User ${userId} role updated from ${user.role} to ${newRole}`,
    );

    return ResponseHelper.success(
      {
        id: user.id,
        email: user.email,
        previousRole: user.role,
        newRole,
      },
      `User role updated to ${newRole} successfully.`,
    );
  }

  async getAllTransactions(pagination: PaginationQueryDto) {
    const { page, limit, sortOrder } = pagination;

    const qb = this.transactionRepository
      .createQueryBuilder('tx')
      .leftJoin('tx.user', 'user')
      .addSelect(['user.id', 'user.email', 'user.firstName', 'user.lastName']);

    const totalItems = await qb.getCount();

    const skip = (page - 1) * limit;
    const transactions = await qb
      .orderBy('tx.created_at', sortOrder)
      .skip(skip)
      .take(limit)
      .getMany();

    const totalPages = Math.ceil(totalItems / limit);

    const formatted = transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      fromCurrency: tx.fromCurrency,
      toCurrency: tx.toCurrency,
      fromAmount: tx.fromAmount ? Number(tx.fromAmount) : null,
      toAmount: Number(tx.toAmount),
      rateUsed: tx.rateUsed ? Number(tx.rateUsed) : null,
      description: tx.description,
      createdAt: tx.createdAt,
      user: tx.user
        ? {
            id: tx.user.id,
            email: tx.user.email,
            firstName: tx.user.firstName,
            lastName: tx.user.lastName,
          }
        : null,
    }));

    return ResponseHelper.paginated(
      formatted,
      { page, limit, totalItems, totalPages },
      'All transactions retrieved successfully.',
    );
  }
}
