import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'nyquist@mailinator.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Hello@2026' })
  @IsString()
  password: string;
}
