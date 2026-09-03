import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePrivacyPreferencesDto {
  @IsOptional()
  @IsBoolean()
  showStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  showCheckinHistory?: boolean;
}
