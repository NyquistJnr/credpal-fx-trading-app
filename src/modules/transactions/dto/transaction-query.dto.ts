import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  TransactionType,
  TransactionStatus,
  Currency,
} from '../../../common/enums';

export class TransactionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TransactionType,
    description: 'Filter by transaction type',
  })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    enum: TransactionStatus,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({
    enum: Currency,
    description: 'Filter by source currency',
  })
  @IsOptional()
  @IsEnum(Currency)
  fromCurrency?: Currency;

  @ApiPropertyOptional({
    enum: Currency,
    description: 'Filter by target currency',
  })
  @IsOptional()
  @IsEnum(Currency)
  toCurrency?: Currency;

  @ApiPropertyOptional({
    description: 'Filter from date (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter to date (ISO 8601)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
