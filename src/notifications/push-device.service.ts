import { Injectable, NotFoundException } from '@nestjs/common';
import { PushPlatform } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { PushService } from '../push/push.service';
import { BadRequestException } from '@nestjs/common';

type SafePushDevice = {
  id: string;
  platform: PushPlatform;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
};

@Injectable()
export class PushDeviceService {
  constructor(private readonly prisma: PrismaService, private readonly pushService: PushService) {}

  private toSafeDevice(device: { id: string; platform: PushPlatform; createdAt: Date; updatedAt: Date; lastUsedAt: Date | null; disabledAt: Date | null }): SafePushDevice {
    return { id: device.id, platform: device.platform, enabled: device.disabledAt === null, createdAt: device.createdAt, updatedAt: device.updatedAt, lastUsedAt: device.lastUsedAt };
  }

  async register(userId: string, dto: RegisterPushDeviceDto): Promise<SafePushDevice> {
    if (!this.pushService.isValidToken(dto.token)) throw new BadRequestException('Token push inválido.');
    const now = new Date();
    const device = await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform, lastUsedAt: now },
      update: { userId, platform: dto.platform, lastUsedAt: now, disabledAt: null },
    });
    return this.toSafeDevice(device);
  }

  async listMine(userId: string): Promise<SafePushDevice[]> {
    const devices = await this.prisma.pushDevice.findMany({ where: { userId, disabledAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return devices.map((device) => this.toSafeDevice(device));
  }

  async disableMine(userId: string, id: string): Promise<void> {
    const device = await this.prisma.pushDevice.findFirst({ where: { id, userId } });
    if (!device) throw new NotFoundException('Dispositivo não encontrado.');
    if (device.disabledAt) return;
    await this.prisma.pushDevice.update({ where: { id }, data: { disabledAt: new Date() } });
  }
}