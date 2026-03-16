import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { FundWalletDto, ConvertCurrencyDto, TradeCurrencyDto } from './dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VerifiedUserGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balances by currency' })
  @ApiResponse({ status: 200, description: 'Wallet balances retrieved' })
  async getBalances(@CurrentUser() user: User) {
    return this.walletService.getBalances(user.id);
  }

  @Post('fund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fund wallet in any supported currency' })
  @ApiResponse({ status: 200, description: 'Wallet funded successfully' })
  @ApiResponse({ status: 409, description: 'Duplicate transaction' })
  async fundWallet(@CurrentUser() user: User, @Body() dto: FundWalletDto) {
    return this.walletService.fundWallet(user.id, dto);
  }

  @Post('convert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Convert between currencies using real-time FX rates',
  })
  @ApiResponse({ status: 200, description: 'Currency conversion successful' })
  @ApiResponse({
    status: 400,
    description: 'Insufficient balance or same currency',
  })
  @ApiResponse({ status: 503, description: 'FX rates unavailable' })
  async convertCurrency(
    @CurrentUser() user: User,
    @Body() dto: ConvertCurrencyDto,
  ) {
    return this.walletService.convertCurrency(user.id, dto);
  }

  @Post('trade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trade Naira with other currencies and vice versa' })
  @ApiResponse({ status: 200, description: 'Trade executed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid trade or insufficient balance',
  })
  @ApiResponse({ status: 503, description: 'FX rates unavailable' })
  async tradeCurrency(
    @CurrentUser() user: User,
    @Body() dto: TradeCurrencyDto,
  ) {
    return this.walletService.tradeCurrency(user.id, dto);
  }
}
