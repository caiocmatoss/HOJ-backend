import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async addFavorite(userId: string, venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: {
        id: venueId,
      },
    });

    if (!venue) {
      throw new NotFoundException('Local não encontrado.');
    }

    const existingFavorite = await this.prisma.favorite.findUnique({
      where: {
        userId_venueId: {
          userId,
          venueId,
        },
      },
    });

    if (existingFavorite) {
      throw new ConflictException('Este local já está nos seus favoritos.');
    }

    return this.prisma.favorite.create({
      data: {
        userId,
        venueId,
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            category: true,
            address: true,
            latitude: true,
            longitude: true,
            occupancy: true,
            description: true,
            image: true,
            rating: true,
            dj: true,
            promotion: true,
            playlist: true,
            status: true,
          },
        },
      },
    });
  }

  async getFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: {
        userId,
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            category: true,
            address: true,
            latitude: true,
            longitude: true,
            occupancy: true,
            description: true,
            image: true,
            rating: true,
            dj: true,
            promotion: true,
            playlist: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return favorites;
  }

  async getFavorite(userId: string, venueId: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: {
        userId_venueId: {
          userId,
          venueId,
        },
      },
      include: {
        venue: true,
      },
    });

    if (!favorite) {
      throw new NotFoundException('Favorito não encontrado.');
    }

    return favorite;
  }

  async removeFavorite(userId: string, venueId: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: {
        userId_venueId: {
          userId,
          venueId,
        },
      },
    });

    if (!favorite) {
      throw new NotFoundException('Favorito não encontrado.');
    }

    await this.prisma.favorite.delete({
      where: {
        userId_venueId: {
          userId,
          venueId,
        },
      },
    });

    return {
      message: 'Favorito removido com sucesso.',
    };
  }
}
