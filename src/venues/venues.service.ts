import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateVenueDto } from './dto/create-venue.dto';

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createVenueDto: CreateVenueDto) {
    return this.prisma.venue.create({
      data: {
        name: createVenueDto.name,
        category: createVenueDto.category,
        address: createVenueDto.address,
        latitude: createVenueDto.latitude,
        longitude: createVenueDto.longitude,
        occupancy: createVenueDto.occupancy ?? 0,
        description: createVenueDto.description,
        image: createVenueDto.image,
        rating: createVenueDto.rating,
        dj: createVenueDto.dj,
        promotion: createVenueDto.promotion,
        playlist: createVenueDto.playlist,
      },
    });
  }

  async findAll() {
    return this.prisma.venue.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: {
        id,
      },
    });

    if (!venue) {
      throw new NotFoundException('Local não encontrado.');
    }

    return venue;
  }

  async update(id: string, data: Partial<CreateVenueDto>) {
    await this.findOne(id);

    return this.prisma.venue.update({
      where: {
        id,
      },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.venue.delete({
      where: {
        id,
      },
    });
  }
}
