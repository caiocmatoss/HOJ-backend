import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateVenueDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  occupancy?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  image?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  dj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  promotion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  playlist?: string;
}
