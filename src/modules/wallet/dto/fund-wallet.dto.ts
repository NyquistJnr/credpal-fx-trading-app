import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '../../../common/enums';

export class FundWalletDto {
  @ApiProperty({
    enum: Currency,
    example: 'NGN',
    description: 'Currency to fund',
  })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({ example: 50000, description: 'Amount to fund' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01, { message: 'Amount must be greater than zero' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Idempotency key to prevent duplicate funding',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
