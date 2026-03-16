import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '../../../common/enums';

export class ConvertCurrencyDto {
  @ApiProperty({
    enum: Currency,
    example: 'NGN',
    description: 'Currency to convert from',
  })
  @IsEnum(Currency)
  fromCurrency: Currency;

  @ApiProperty({
    enum: Currency,
    example: 'USD',
    description: 'Currency to convert to',
  })
  @IsEnum(Currency)
  toCurrency: Currency;

  @ApiProperty({
    example: 10000,
    description: 'Amount to convert (in source currency)',
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01, { message: 'Amount must be greater than zero' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Idempotency key to prevent duplicate conversions',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
