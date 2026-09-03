import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePrivacyPreferencesDto } from './dto/update-privacy-preferences.dto';

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  getPreferences(userId: string) {
    return this.prisma.privacyPreferences.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  updatePreferences(userId: string, dto: UpdatePrivacyPreferencesDto) {
    return this.prisma.privacyPreferences.upsert({ where: { userId }, create: { userId, ...dto }, update: dto });
  }
}
