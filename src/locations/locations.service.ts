import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateLocationPreferencesDto } from './dto/update-location-preferences.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  getPreferences(userId: string) {
    return this.prisma.locationPreferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  updatePreferences(userId: string, dto: UpdateLocationPreferencesDto) {
    return this.prisma.locationPreferences.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async update(userId: string, dto: UpdateLocationDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return this.prisma.userLocation.upsert({
      where: {
        userId,
      },

      create: {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },

      update: {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  async findByUserId(userId: string) {
    return this.prisma.userLocation.findUnique({
      where: {
        userId,
      },
    });
  }

  async remove(userId: string) {
    const location = await this.prisma.userLocation.findUnique({
      where: {
        userId,
      },
    });

    if (!location) {
      throw new NotFoundException('Localização não encontrada.');
    }

    await this.prisma.userLocation.delete({
      where: {
        userId,
      },
    });

    return {
      message: 'Localização removida com sucesso.',
    };
  }

  async getAcceptedFriendIds(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          {
            requesterId: userId,
          },
          {
            addresseeId: userId,
          },
        ],
      },

      select: {
        requesterId: true,
        addresseeId: true,
      },
    });

    return friendships.map((friendship) =>
      friendship.requesterId === userId
        ? friendship.addresseeId
        : friendship.requesterId,
    );
  }

  async getLocationForRealtime(userId: string) {
    const location = await this.prisma.userLocation.findUnique({
      where: {
        userId,
      },

      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    if (!location) {
      return null;
    }

    return {
      userId: location.user.id,
      name: location.user.name,
      avatar: location.user.avatar,
      status: location.user.status,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      updatedAt: location.updatedAt,
    };
  }
}
