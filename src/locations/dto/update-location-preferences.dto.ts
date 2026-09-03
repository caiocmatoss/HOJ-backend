import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export enum LocationAccuracyDto {
  HIGH = 'HIGH',
  BALANCED = 'BALANCED',
}

export enum LocationUpdateFrequencyDto {
  REALTIME = 'REALTIME',
  FIVE_MINUTES = 'FIVE_MINUTES',
  FIFTEEN_MINUTES = 'FIFTEEN_MINUTES',
}

export class UpdateLocationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  precise?: boolean;

  @IsOptional()
  @IsEnum(LocationAccuracyDto)
  accuracy?: LocationAccuracyDto;

  @IsOptional()
  @IsEnum(LocationUpdateFrequencyDto)
  updateFreq?: LocationUpdateFrequencyDto;

  @IsOptional()
  @IsBoolean()
  shareWithFriends?: boolean;
}
