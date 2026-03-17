import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';
import { TransactionQueryDto } from './dto';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VerifiedUserGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated transaction history with filters' })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved' })
  async getTransactions(
    @CurrentUser() user: User,
    @Query() query: TransactionQueryDto,
  ) {
    return this.transactionsService.getTransactions(user.id, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get transaction summary statistics' })
  @ApiResponse({ status: 200, description: 'Transaction summary retrieved' })
  async getTransactionSummary(@CurrentUser() user: User) {
    return this.transactionsService.getTransactionSummary(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single transaction by ID' })
  @ApiResponse({ status: 200, description: 'Transaction retrieved' })
  async getTransactionById(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.getTransactionById(user.id, id);
  }
}
