import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PushPlatform } from '../../../generated/prisma/client';

export class RegisterPushDeviceDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsEnum(PushPlatform)
  platform!: PushPlatform;
}