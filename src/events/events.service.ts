import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly venueListSelect = {
    id: true,
    name: true,
    category: true,
    address: true,
    latitude: true,
    longitude: true,
    image: true,
    rating: true,
    status: true,
  } as const;

  private readonly venueDetailSelect = {
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
  } as const;

  async create(dto: CreateEventDto) {
    const venue = await this.prisma.venue.findUnique({
      where: {
        id: dto.venueId,
      },
    });

    if (!venue) {
      throw new NotFoundException('Local não encontrado.');
    }

    const eventDate = new Date(dto.date);

    if (Number.isNaN(eventDate.getTime())) {
      throw new BadRequestException('Data do evento inválida.');
    }

    return this.prisma.event.create({
      data: {
        title: dto.title.trim(),
        image: dto.image?.trim(),
        venueId: dto.venueId,
        venueName: dto.venueName?.trim() || venue.name,
        date: eventDate,
        time: dto.time,
        category: dto.category.trim(),
        description: dto.description?.trim(),
        price: dto.price,
        attendees: dto.attendees ?? 0,
        isLive: dto.isLive ?? false,
      },

      include: {
        venue: {
          select: this.venueListSelect,
        },
      },
    });
  }

  async findAll(filters?: {
    venueId?: string;
    category?: string;
    isLive?: boolean;
  }) {
    return this.prisma.event.findMany({
      where: {
        ...(filters?.venueId
          ? {
              venueId: filters.venueId,
            }
          : {}),

        ...(filters?.category
          ? {
              category: filters.category,
            }
          : {}),

        ...(filters?.isLive !== undefined
          ? {
              isLive: filters.isLive,
            }
          : {}),
      },

      include: {
        venue: {
          select: this.venueListSelect,
        },
      },

      orderBy: [
        {
          date: 'asc',
        },
        {
          time: 'asc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.event.findUnique({
      where: {
        id,
      },

      include: {
        venue: {
          select: this.venueDetailSelect,
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado.');
    }

    return event;
  }

  async update(id: string, data: UpdateEventDto) {
    const existingEvent = await this.prisma.event.findUnique({
      where: {
        id,
      },
    });

    if (!existingEvent) {
      throw new NotFoundException('Evento não encontrado.');
    }

    let venueName: string | null | undefined = data.venueName;

    if (data.venueId !== undefined) {
      const venue = await this.prisma.venue.findUnique({
        where: {
          id: data.venueId,
        },
      });

      if (!venue) {
        throw new NotFoundException('Local não encontrado.');
      }

      if (data.venueName === undefined) {
        venueName = venue.name;
      }
    }

    let eventDate: Date | undefined;

    if (data.date !== undefined) {
      eventDate = new Date(data.date);

      if (Number.isNaN(eventDate.getTime())) {
        throw new BadRequestException('Data do evento inválida.');
      }
    }

    return this.prisma.event.update({
      where: {
        id,
      },

      data: {
        ...(data.title !== undefined
          ? {
              title: data.title.trim(),
            }
          : {}),

        ...(data.image !== undefined
          ? {
              image: data.image?.trim() || null,
            }
          : {}),

        ...(data.venueId !== undefined
          ? {
              venueId: data.venueId,
            }
          : {}),

        ...(venueName !== undefined
          ? {
              venueName: venueName === null ? null : venueName.trim() || null,
            }
          : {}),

        ...(eventDate !== undefined
          ? {
              date: eventDate,
            }
          : {}),

        ...(data.time !== undefined
          ? {
              time: data.time,
            }
          : {}),

        ...(data.category !== undefined
          ? {
              category: data.category.trim(),
            }
          : {}),

        ...(data.description !== undefined
          ? {
              description: data.description?.trim() || null,
            }
          : {}),

        ...(data.price !== undefined
          ? {
              price: data.price,
            }
          : {}),

        ...(data.attendees !== undefined
          ? {
              attendees: data.attendees,
            }
          : {}),

        ...(data.isLive !== undefined
          ? {
              isLive: data.isLive,
            }
          : {}),
      },

      include: {
        venue: {
          select: this.venueListSelect,
        },
      },
    });
  }

  async remove(id: string) {
    const existingEvent = await this.prisma.event.findUnique({
      where: {
        id,
      },
    });

    if (!existingEvent) {
      throw new NotFoundException('Evento não encontrado.');
    }

    await this.prisma.event.delete({
      where: {
        id,
      },
    });

    return {
      message: 'Evento removido com sucesso.',
    };
  }
}
