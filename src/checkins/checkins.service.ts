import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CheckinsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: {
        id: venueId,
      },
    });

    if (!venue) {
      throw new NotFoundException('Local não encontrado.');
    }

    const existingCheckin = await this.prisma.checkin.findFirst({
      where: {
        userId,
        checkedOutAt: null,
      },
    });

    if (existingCheckin) {
      if (existingCheckin.venueId === venueId) {
        throw new ConflictException('Você já está neste local.');
      }

      throw new ConflictException(
        'Você já está em outro local. Faça check-out antes de entrar em outro.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const checkin = await tx.checkin.create({
        data: {
          userId,
          venueId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              bio: true,
              status: true,
            },
          },
          venue: {
            select: {
              id: true,
              name: true,
              category: true,
              address: true,
              latitude: true,
              longitude: true,
              occupancy: true,
              status: true,
            },
          },
        },
      });

      const updatedVenue = await tx.venue.update({
        where: {
          id: venueId,
        },
        data: {
          occupancy: {
            increment: 1,
          },
        },
        select: {
          id: true,
          name: true,
          occupancy: true,
        },
      });

      return {
        checkin,
        venue: updatedVenue,
      };
    });

    return result;
  }

  async getMyActiveCheckin(userId: string) {
    return this.prisma.checkin.findFirst({
      where: {
        userId,
        checkedOutAt: null,
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
            image: true,
            rating: true,
            status: true,
          },
        },
      },
      orderBy: {
        checkedInAt: 'desc',
      },
    });
  }

  async getVenueCheckins(userId: string, venueId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: {
        id: venueId,
      },
      select: {
        id: true,
      },
    });

    if (!venue) {
      throw new NotFoundException('Local não encontrado.');
    }

    return this.prisma.checkin.findMany({
      where: {
        venueId,
        checkedOutAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            status: true,
          },
        },
      },
      orderBy: {
        checkedInAt: 'desc',
      },
    });
  }

  async checkout(userId: string, venueId: string) {
    const checkin = await this.prisma.checkin.findFirst({
      where: {
        userId,
        venueId,
        checkedOutAt: null,
      },
    });

    if (!checkin) {
      throw new NotFoundException('Check-in ativo não encontrado.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedCheckin = await tx.checkin.update({
        where: {
          id: checkin.id,
        },
        data: {
          checkedOutAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              bio: true,
              status: true,
            },
          },
          venue: {
            select: {
              id: true,
              name: true,
              occupancy: true,
            },
          },
        },
      });

      await tx.venue.updateMany({
        where: {
          id: venueId,
          occupancy: {
            gt: 0,
          },
        },
        data: {
          occupancy: {
            decrement: 1,
          },
        },
      });

      const updatedVenue = await tx.venue.findUnique({
        where: {
          id: venueId,
        },
        select: {
          id: true,
          name: true,
          occupancy: true,
        },
      });

      return {
        checkin: updatedCheckin,
        venue: updatedVenue,
      };
    });

    return result;
  }

  async getMyCheckinHistory(userId: string) {
    return this.prisma.checkin.findMany({
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
            image: true,
            rating: true,
          },
        },
      },
      orderBy: {
        checkedInAt: 'desc',
      },
    });
  }
}
