import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateShareDto {
  @IsString()
  @IsIn(['bill', 'view'])
  targetType: 'bill' | 'view';

  @IsString()
  @IsNotEmpty()
  targetId: string;

  @IsString()
  @IsNotEmpty()
  recipientContact: string;

  @IsOptional()
  @IsInt()
  @IsIn([7, 30, 90])
  expiresInDays?: number;
}
