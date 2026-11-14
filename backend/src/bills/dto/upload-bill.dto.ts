import { IsOptional, IsString, IsBooleanString } from 'class-validator';

export class UploadBillDto {
  @IsOptional()
  @IsString()
  viewId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsBooleanString()
  isPersonal?: string;
}

