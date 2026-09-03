import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';

type VenueListFilters = {
  q?: string;
  locality?: string;
  region?: string;
  country?: string;
  source?: 'MANUAL' | 'IMPORTED';
  limit?: number;
  cursor?: string;
  category?: string;
  status?: 'OPEN' | 'CLOSED';
  latitude?: number;
  longitude?: number;
  radius?: number;
};

type VenueResponse = {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  occupancy: number;
  capacity: number | null;
  source: 'MANUAL' | 'IMPORTED';
  externalProvider: string | null;
  externalId: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  postcode: string | null;
  phone: string | null;
  website: string | null;
  sourceRefreshedAt: Date | null;
  sourceClosedAt: Date | null;
      images?: Array<{ url: string; position: number }>;
  description: string;
  image: string;
  rating: number;
  distance: string;
  people: number;
  gallery: string[];
  dj: string;
  promotion: string;
  playlist: string;
  status: 'open' | 'closed';
};

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Converte graus para radianos.
   */
  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  /**
   * Calcula a distância entre dois pontos usando
   * a fórmula de Haversine.
   *
   * Retorno em quilômetros.
   */
  private calculateDistanceKm(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    const earthRadiusKm = 6371;

    const deltaLatitude = this.toRadians(latitude2 - latitude1);

    const deltaLongitude = this.toRadians(longitude2 - longitude1);

    const lat1 = this.toRadians(latitude1);
    const lat2 = this.toRadians(latitude2);

    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
  }

  /**
   * Formata a distância para o formato utilizado
   * pelo frontend.
   */
  private formatDistance(distanceKm: number | null): string {
    if (distanceKm === null) {
      return '';
    }

    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)} m`;
    }

    return `${distanceKm.toFixed(1)} km`;
  }

  /**
   * Converte o Venue do Prisma para o formato
   * consumido pelo frontend.
   */
  private serializeVenue(
    venue: {
      id: string;
      name: string;
      category: string;
      address: string;
      latitude: unknown;
      longitude: unknown;
      occupancy: number;
  capacity: number | null;
  source: 'MANUAL' | 'IMPORTED';
  externalProvider: string | null;
  externalId: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  postcode: string | null;
  phone: string | null;
  website: string | null;
  sourceRefreshedAt: Date | null;
  sourceClosedAt: Date | null;
      images?: Array<{ url: string; position: number }>;
      description: string | null;
      image: string | null;
      rating: unknown;
      dj: string | null;
      promotion: string | null;
      playlist: string | null;
      status: 'OPEN' | 'CLOSED';
    },
    distanceKm: number | null = null,
  ): VenueResponse {
    const latitude = Number(venue.latitude);
    const longitude = Number(venue.longitude);

    const rating = venue.rating === null ? 0 : Number(venue.rating);

    return {
      id: venue.id,

      name: venue.name,

      category: venue.category,

      address: venue.address,

      latitude,

      longitude,

      occupancy: venue.occupancy,
      capacity: venue.capacity,
      source: venue.source,
      externalProvider: venue.externalProvider,
      externalId: venue.externalId,

      locality: venue.locality ?? null,

      region: venue.region ?? null,

      country: venue.country ?? null,

      postcode: venue.postcode ?? null,

      phone: venue.phone ?? null,

      website: venue.website ?? null,

      sourceRefreshedAt: venue.sourceRefreshedAt ?? null,

      sourceClosedAt: venue.sourceClosedAt ?? null,

      description: venue.description ?? '',

      image: venue.image ?? '',

      rating,

      distance: this.formatDistance(distanceKm),

      people: venue.occupancy,

      /**
       * Gallery ainda não existe no schema Prisma.
       *
       * Mantemos o campo para compatibilidade
       * com o frontend atual.
       */
      gallery: (venue.images ?? []).sort((a, b) => a.position - b.position).map((image) => image.url),

      dj: venue.dj ?? '',

      promotion: venue.promotion ?? '',

      playlist: venue.playlist ?? '',

      status: venue.status === 'OPEN' ? 'open' : 'closed',
    };
  }

  async create(createVenueDto: CreateVenueDto) {
    const venue = await this.prisma.venue.create({
      data: {
        name: createVenueDto.name.trim(),

        category: createVenueDto.category.trim(),

        address: createVenueDto.address.trim(),

        latitude: createVenueDto.latitude,

        longitude: createVenueDto.longitude,

        occupancy: createVenueDto.occupancy ?? 0,
        capacity: createVenueDto.capacity,

        description: createVenueDto.description?.trim(),

        image: createVenueDto.image?.trim(),

        rating: createVenueDto.rating,

        dj: createVenueDto.dj?.trim(),

        promotion: createVenueDto.promotion?.trim(),

        playlist: createVenueDto.playlist?.trim(),
      },
    });

    return this.serializeVenue(venue);
  }

  /**
   * Lista locais.
   *
   * Filtros disponíveis:
   *
   * GET /venues
   *
   * GET /venues?category=Bares
   *
   * GET /venues?status=OPEN
   *
   * GET /venues?latitude=-23.55052&longitude=-46.633308
   *
   * GET /venues?latitude=-23.55052&longitude=-46.633308&radius=10
   */
  async findAll(filters: VenueListFilters = {}) {
    const venues = await this.prisma.venue.findMany({
      where: {
        ...(filters.q ? { OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { address: { contains: filters.q, mode: "insensitive" } }] } : {}),
        ...(filters.locality ? { locality: { equals: filters.locality, mode: "insensitive" } } : {}),
        ...(filters.region ? { region: { equals: filters.region, mode: "insensitive" } } : {}),
        ...(filters.country ? { country: { equals: filters.country, mode: "insensitive" } } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.category
          ? {
              category: {
                equals: filters.category,
                mode: 'insensitive',
              },
            }
          : {}),

        ...(filters.status
          ? {
              status: filters.status,
            }
          : {}),
      },

      take: filters.limit ? Math.min(Math.max(filters.limit, 1), 100) : undefined,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),

      orderBy: {
        createdAt: 'desc',
      },
    });

    const hasUserLocation =
      filters.latitude !== undefined && filters.longitude !== undefined;

    const radius = filters.radius !== undefined ? filters.radius : 50;

    const serialized = venues
      .map((venue) => {
        const venueLatitude = Number(venue.latitude);

        const venueLongitude = Number(venue.longitude);

        let distanceKm: number | null = null;

        if (hasUserLocation) {
          distanceKm = this.calculateDistanceKm(
            filters.latitude!,
            filters.longitude!,
            venueLatitude,
            venueLongitude,
          );
        }

        return {
          venue: this.serializeVenue(venue, distanceKm),

          distanceKm,
        };
      })
      .filter((item) => {
        if (!hasUserLocation) {
          return true;
        }

        return item.distanceKm! <= radius;
      });

    /**
     * Quando a localização do usuário é enviada,
     * os locais mais próximos aparecem primeiro.
     */
    if (hasUserLocation) {
      serialized.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    return serialized.map((item) => item.venue);
  }

  async findOne(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: {
        id,
      },
      include: { images: { orderBy: { position: "asc" } } },
    });

    if (!venue) {
      throw new NotFoundException('Local não encontrado.');
    }

    return this.serializeVenue(venue);
  }

  async update(id: string, updateVenueDto: UpdateVenueDto) {
    await this.findOne(id);

    const data: {
      name?: string;
      category?: string;
      address?: string;
      latitude?: number;
      longitude?: number;
      occupancy?: number;
      capacity?: number;
      description?: string;
      image?: string;
      rating?: number;
      dj?: string;
      promotion?: string;
      playlist?: string;
    } = {};

    if (updateVenueDto.name !== undefined) {
      data.name = updateVenueDto.name.trim();
    }

    if (updateVenueDto.category !== undefined) {
      data.category = updateVenueDto.category.trim();
    }

    if (updateVenueDto.address !== undefined) {
      data.address = updateVenueDto.address.trim();
    }

    if (updateVenueDto.latitude !== undefined) {
      data.latitude = updateVenueDto.latitude;
    }

    if (updateVenueDto.longitude !== undefined) {
      data.longitude = updateVenueDto.longitude;
    }

    if (updateVenueDto.occupancy !== undefined) {
      data.occupancy = updateVenueDto.occupancy;
    }

    if (updateVenueDto.capacity !== undefined) {
      data.capacity = updateVenueDto.capacity;
    }

    if (updateVenueDto.description !== undefined) {
      data.description = updateVenueDto.description.trim();
    }

    if (updateVenueDto.image !== undefined) {
      data.image = updateVenueDto.image.trim();
    }

    if (updateVenueDto.rating !== undefined) {
      data.rating = updateVenueDto.rating;
    }

    if (updateVenueDto.dj !== undefined) {
      data.dj = updateVenueDto.dj.trim();
    }

    if (updateVenueDto.promotion !== undefined) {
      data.promotion = updateVenueDto.promotion.trim();
    }

    if (updateVenueDto.playlist !== undefined) {
      data.playlist = updateVenueDto.playlist.trim();
    }

    const venue = await this.prisma.venue.update({
      where: {
        id,
      },

      data,
    });

    return this.serializeVenue(venue);
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.venue.delete({
      where: {
        id,
      },
    });

    return {
      message: 'Local removido com sucesso.',
    };
  }
}
