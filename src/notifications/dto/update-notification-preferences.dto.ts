import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional() @IsBoolean() friendsNearby?: boolean;
  @IsOptional() @IsBoolean() newEvents?: boolean;
  @IsOptional() @IsBoolean() messages?: boolean;
  @IsOptional() @IsBoolean() eventReminders?: boolean;
  @IsOptional() @IsBoolean() friendCheckins?: boolean;
  @IsOptional() @IsBoolean() promotions?: boolean;
  @IsOptional() @IsBoolean() appUpdates?: boolean;
  @IsOptional() @IsBoolean() weeklyDigest?: boolean;
}
