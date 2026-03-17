import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TransactionQueryDto } from '../transactions/dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VerifiedUserGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiQuery({ name: 'email', required: false, description: 'Filter by email' })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: Role,
    description: 'Filter by role',
  })
  async getUsers(
    @Query() pagination: PaginationQueryDto,
    @Query('email') email?: string,
    @Query('role') role?: Role,
  ) {
    return this.adminService.getUsers(pagination, email, role);
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'Get a single user with wallet balances (Admin only)',
  })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserById(id);
  }

  @Get('users/:id/transactions')
  @ApiOperation({
    summary: "Get a specific user's transactions with filters (Admin only)",
  })
  @ApiResponse({ status: 200, description: 'User transactions retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TransactionQueryDto,
  ) {
    return this.adminService.getUserTransactions(id, query);
  }

  @Patch('users/:id/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Promote a user to admin or demote to user (Admin only)',
  })
  @ApiQuery({
    name: 'role',
    required: true,
    enum: Role,
    description: 'New role to assign',
  })
  @ApiResponse({ status: 200, description: 'User role updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('role') role: Role,
  ) {
    return this.adminService.updateUserRole(id, role);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'View all transactions across users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved' })
  async getAllTransactions(@Query() pagination: PaginationQueryDto) {
    return this.adminService.getAllTransactions(pagination);
  }
}
