import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^@?[a-z0-9._]{3,30}$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ValidateIf((_object, value) => value !== '')
  @Matches(/^.+,\s*[A-Za-z]{2}$/)
  city?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_object, value) => value !== '')
  @Matches(/^\+?[0-9()\s-]{8,30}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  avatar?: string;
}
