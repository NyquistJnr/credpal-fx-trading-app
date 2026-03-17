import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { Role } from 'src/common/enums';

export class AdminUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
