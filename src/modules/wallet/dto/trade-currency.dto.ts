import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '../../../common/enums';

export class TradeCurrencyDto {
  @ApiProperty({
    enum: Currency,
    example: 'NGN',
    description: 'Currency to sell',
  })
  @IsEnum(Currency)
  fromCurrency: Currency;

  @ApiProperty({
    enum: Currency,
    example: 'USD',
    description: 'Currency to buy',
  })
  @IsEnum(Currency)
  toCurrency: Currency;

  @ApiProperty({
    example: 50000,
    description: 'Amount to sell (in source currency)',
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01, { message: 'Amount must be greater than zero' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Idempotency key to prevent duplicate trades',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
