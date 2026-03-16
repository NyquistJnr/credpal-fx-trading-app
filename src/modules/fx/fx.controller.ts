import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FxService } from './fx.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { Currency } from '../../common/enums';
import { ResponseHelper } from '../../common/helpers/response.helper';
import { UnsupportedCurrencyException } from '../../common/filters/business-exception';

@ApiTags('FX')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VerifiedUserGuard)
@Controller('fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  @ApiOperation({ summary: 'Get FX rates for a base currency' })
  @ApiQuery({
    name: 'base',
    required: false,
    enum: Currency,
    description: 'Base currency (defaults to NGN)',
  })
  @ApiResponse({ status: 200, description: 'FX rates retrieved successfully' })
  @ApiResponse({ status: 503, description: 'FX rates unavailable' })
  async getRates(@Query('base') base?: string) {
    const baseCurrency = (base?.toUpperCase() ?? 'NGN') as Currency;

    if (!Object.values(Currency).includes(baseCurrency)) {
      throw new UnsupportedCurrencyException(baseCurrency);
    }

    const rateData = await this.fxService.getRates(baseCurrency);

    return ResponseHelper.success(
      {
        baseCurrency: rateData.baseCurrency,
        rates: rateData.rates,
        provider: rateData.provider,
        cached: rateData.cached,
        fetchedAt: rateData.fetchedAt,
      },
      'FX rates retrieved successfully.',
    );
  }

  @Get('rates/all')
  @ApiOperation({ summary: 'Get FX rates for all supported currencies' })
  @ApiResponse({ status: 200, description: 'All FX rates retrieved' })
  async getAllRates() {
    const allRates = await this.fxService.getAllSupportedRates();

    return ResponseHelper.success(
      allRates,
      'All supported FX rates retrieved successfully.',
    );
  }

  @Get('pair')
  @ApiOperation({ summary: 'Get rate for a specific currency pair' })
  @ApiQuery({ name: 'from', required: true, enum: Currency })
  @ApiQuery({ name: 'to', required: true, enum: Currency })
  @ApiResponse({ status: 200, description: 'Pair rate retrieved' })
  async getPairRate(@Query('from') from: string, @Query('to') to: string) {
    const fromCurrency = from?.toUpperCase() as Currency;
    const toCurrency = to?.toUpperCase() as Currency;

    if (!Object.values(Currency).includes(fromCurrency)) {
      throw new UnsupportedCurrencyException(fromCurrency);
    }
    if (!Object.values(Currency).includes(toCurrency)) {
      throw new UnsupportedCurrencyException(toCurrency);
    }

    const rateData = await this.fxService.getRate(fromCurrency, toCurrency);

    return ResponseHelper.success(
      {
        from: fromCurrency,
        to: toCurrency,
        rate: rateData.rate,
        provider: rateData.provider,
        fetchedAt: rateData.fetchedAt,
      },
      `Rate for ${fromCurrency} → ${toCurrency} retrieved successfully.`,
    );
  }
}
