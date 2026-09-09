import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { getOccupancyPercent } from './occupancy-percent';
import { normalizeImage, VENUE_IMAGE_MAX_BYTES } from '../storage/image-validator';
import { StorageService } from '../storage/storage.service';
import { randomUUID } from 'node:crypto';

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
  occupancyPercent: number | null;
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
  constructor(private readonly prisma: PrismaService, @Optional() private readonly storage?: StorageService) {}

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

  private async getActiveOccupancyByVenueIds(venueIds: string[], now: Date) {
    if (venueIds.length === 0) return new Map<string, number>();
    const grouped = await this.prisma.checkin.groupBy({
      by: ['venueId'],
      where: { venueId: { in: venueIds }, checkedOutAt: null, expiresAt: { gt: now } },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.venueId, row._count._all]));
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
    occupancyOverride?: number,
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

      occupancy: occupancyOverride ?? venue.occupancy,
      capacity: venue.capacity,
      occupancyPercent: getOccupancyPercent(occupancyOverride ?? venue.occupancy, venue.capacity),
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

      people: occupancyOverride ?? venue.occupancy,

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

    const occupancy = await this.prisma.checkin.count({ where: { venueId: venue.id, checkedOutAt: null, expiresAt: { gt: new Date() } } });

    return this.serializeVenue(venue, null, occupancy);
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
  async findAll(filters: VenueListFilters = {}, pagination?: import('../common/pagination').Pagination): Promise<any> {
    const where: Prisma.VenueWhereInput = { ...(filters.q ? { OR: [{ name: { contains: filters.q, mode: 'insensitive' } }, { address: { contains: filters.q, mode: 'insensitive' } }] } : {}), ...(filters.locality ? { locality: { equals: filters.locality, mode: 'insensitive' } } : {}), ...(filters.region ? { region: { equals: filters.region, mode: 'insensitive' } } : {}), ...(filters.country ? { country: { equals: filters.country, mode: 'insensitive' } } : {}), ...(filters.source ? { source: filters.source } : {}), ...(filters.category ? { category: { equals: filters.category, mode: 'insensitive' } } : {}), ...(filters.status ? { status: filters.status } : {}) };
    const geo = filters.latitude !== undefined && filters.longitude !== undefined;
    const venues = await this.prisma.venue.findMany({ where, ...(geo || !pagination ? {} : { skip: pagination.skip, take: pagination.take }), ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}), orderBy: { createdAt: 'desc' } });
    const now = new Date(); const active = await this.getActiveOccupancyByVenueIds(venues.map((v) => v.id), now); const radius = filters.radius ?? 50;
    let serialized = venues.map((venue) => { const distanceKm = geo ? this.calculateDistanceKm(filters.latitude!, filters.longitude!, Number(venue.latitude), Number(venue.longitude)) : null; return { venue: this.serializeVenue(venue, distanceKm, active.get(venue.id) ?? 0), distanceKm }; }).filter((item) => !geo || (item.distanceKm ?? 0) <= radius);
    if (geo) serialized.sort((a,b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    const total = geo ? serialized.length : (pagination ? await this.prisma.venue.count({ where }) : serialized.length); const allItems = serialized.map((item) => item.venue); const items = geo && pagination ? allItems.slice(pagination.skip, pagination.skip + pagination.take) : allItems; return pagination && !filters.cursor ? { items, total } : items;
  }
  private async uploadVenueImage(venueId: string, file: { buffer: Buffer; mimetype: string }, prefix: string) {
    const body = await normalizeImage(file, VENUE_IMAGE_MAX_BYTES);
    return this.storage!.upload({ key: `venues/${venueId}/${prefix}/${randomUUID()}.webp`, body, contentType: 'image/webp' });
  }

  async uploadMainImage(id: string, file: { buffer: Buffer; mimetype: string }) {
    const venue = await this.prisma.venue.findUnique({ where: { id }, select: { image: true } });
    if (!venue) throw new NotFoundException('Local não encontrado.');
    const upload = await this.uploadVenueImage(id, file, 'image');
    try {
      await this.prisma.venue.update({ where: { id }, data: { image: upload.url } });
    } catch (error) {
      try { await this.storage!.delete(upload.key); } catch { /* best effort cleanup */ }
      throw error;
    }
    try { const key = this.storage!.getKeyFromManagedUrl(venue.image); if (key) await this.storage!.delete(key); } catch { /* new image remains valid */ }
    return this.findOne(id);
  }

  async deleteMainImage(id: string): Promise<void> {
    const venue = await this.prisma.venue.findUnique({ where: { id }, select: { image: true } });
    if (!venue) throw new NotFoundException('Local não encontrado.');
    await this.prisma.venue.update({ where: { id }, data: { image: null } });
    try { const key = this.storage!.getKeyFromManagedUrl(venue.image); if (key) await this.storage!.delete(key); } catch { /* database state is authoritative */ }
  }

  async addGalleryImage(id: string, file: { buffer: Buffer; mimetype: string }) {
    const venue = await this.prisma.venue.findUnique({ where: { id }, select: { id: true } });
    if (!venue) throw new NotFoundException('Local não encontrado.');
    const upload = await this.uploadVenueImage(id, file, 'images');
    try {
      const aggregate = await this.prisma.venueImage.aggregate({ where: { venueId: id }, _max: { position: true } });
      return await this.prisma.venueImage.create({ data: { venueId: id, url: upload.url, position: (aggregate._max.position ?? -1) + 1 }, select: { id: true, venueId: true, url: true, position: true, createdAt: true } });
    } catch (error) {
      try { await this.storage!.delete(upload.key); } catch { /* best effort cleanup */ }
      throw error;
    }
  }

  async deleteGalleryImage(venueId: string, imageId: string): Promise<void> {
    const image = await this.prisma.venueImage.findUnique({ where: { id: imageId }, select: { venueId: true, url: true } });
    if (!image || image.venueId !== venueId) throw new NotFoundException('Imagem não encontrada.');
    await this.prisma.venueImage.delete({ where: { id: imageId } });
    try { const key = this.storage!.getKeyFromManagedUrl(image.url); if (key) await this.storage!.delete(key); } catch { /* database state is authoritative */ }
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

    const occupancy = await this.prisma.checkin.count({ where: { venueId: id, checkedOutAt: null, expiresAt: { gt: new Date() } } });

    return this.serializeVenue(venue, null, occupancy);
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
      capacity?: number | null;
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

    const occupancy = await this.prisma.checkin.count({ where: { venueId: id, checkedOutAt: null, expiresAt: { gt: new Date() } } });

    return this.serializeVenue(venue, null, occupancy);
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
