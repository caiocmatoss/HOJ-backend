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

export class CreateVenueDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  category: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  address: string;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

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
