import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FxRateLog } from './entities/fx-rate-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FxRateLog])],
  exports: [TypeOrmModule],
})
export class FxModule {}
