import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  contact: string; // Email or 10-digit mobile number

  @IsString()
  @IsOptional()
  name?: string; // Optional user name for sign up
}

