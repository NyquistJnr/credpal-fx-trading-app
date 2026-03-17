import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'The current refresh token' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
