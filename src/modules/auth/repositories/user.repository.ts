import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findByIdWithRelations(
    id: string,
    relations: string[] = [],
  ): Promise<User | null> {
    return this.findOne({
      where: { id },
      relations,
    });
  }

  async markAsVerified(userId: string): Promise<void> {
    await this.update(userId, { isVerified: true } as Partial<User>);
  }

  async updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.update(userId, { refreshTokenHash } as Partial<User>);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.update(userId, {
      passwordHash,
      refreshTokenHash: null,
    } as Partial<User>);
  }
}
