import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletBalance } from './entities/wallet-balance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WalletBalance])],
  exports: [TypeOrmModule],
})
export class WalletModule {}
