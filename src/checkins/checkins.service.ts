import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getCheckinExpiry, getCheckinTtlMinutes } from './checkin-lifecycle';
import { getOccupancyPercent } from '../venues/occupancy-percent';

const userSelect = { id: true, name: true, email: true, avatar: true, bio: true, status: true } as const;
const venueSelect = { id: true, name: true, category: true, address: true, latitude: true, longitude: true, occupancy: true, capacity: true, status: true } as const;
const MAX_SERIALIZABLE_RETRIES = 3;

async function serializableTransaction<T>(prisma: PrismaService, callback: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const candidate = error as { code?: string; cause?: { originalCode?: string; kind?: string } };
      const retryable = (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') || candidate.cause?.originalCode === '40001' || candidate.cause?.kind === 'TransactionWriteConflict';
      if (!retryable) throw error;
      if (attempt === MAX_SERIALIZABLE_RETRIES) throw new ConflictException('Operação concorrente não pôde ser concluída. Tente novamente.');
    }
  }
  throw new Error('Serializable transaction retry exhausted');
}

@Injectable()
export class CheckinsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, venueId: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new NotFoundException('Local não encontrado.');
    const now = new Date();
    const expiresAt = getCheckinExpiry(now, getCheckinTtlMinutes());
    return serializableTransaction(this.prisma, async (tx) => {
      const expired = await tx.checkin.findMany({ where: { userId, checkedOutAt: null, expiresAt: { lte: now } }, select: { id: true, venueId: true } });
      for (const old of expired) {
        await tx.checkin.update({ where: { id: old.id }, data: { checkedOutAt: now } });
      }
      const active = await tx.checkin.findFirst({ where: { userId, checkedOutAt: null, expiresAt: { gt: now } }, orderBy: { checkedInAt: 'desc' } });
      if (active?.venueId === venueId) {
        const checkin = await tx.checkin.update({ where: { id: active.id }, data: { expiresAt }, include: { user: { select: userSelect }, venue: { select: venueSelect } } });
        const currentVenue = await tx.venue.findUnique({ where: { id: venueId }, select: { id: true, name: true, occupancy: true, capacity: true } });
        const activeOccupancy = await tx.checkin.count({ where: { venueId, checkedOutAt: null, expiresAt: { gt: now } } });
        return { checkin: { ...checkin, venue: { ...checkin.venue, occupancy: activeOccupancy, occupancyPercent: getOccupancyPercent(activeOccupancy, checkin.venue?.capacity) } }, venue: currentVenue ? { ...currentVenue, occupancy: activeOccupancy, occupancyPercent: getOccupancyPercent(activeOccupancy, currentVenue.capacity) } : currentVenue };
      }
      if (active) {
        await tx.checkin.update({ where: { id: active.id }, data: { checkedOutAt: now } });
      }
      const checkin = await tx.checkin.create({ data: { userId, venueId, checkedInAt: now, expiresAt }, include: { user: { select: userSelect }, venue: { select: venueSelect } } });
      const currentVenue = await tx.venue.findUnique({ where: { id: venueId }, select: { id: true, name: true, occupancy: true, capacity: true } });
      const activeOccupancy = await tx.checkin.count({ where: { venueId, checkedOutAt: null, expiresAt: { gt: now } } });
      return { checkin: { ...checkin, venue: { ...checkin.venue, occupancy: activeOccupancy, occupancyPercent: getOccupancyPercent(activeOccupancy, checkin.venue?.capacity) } }, venue: currentVenue ? { ...currentVenue, occupancy: activeOccupancy, occupancyPercent: getOccupancyPercent(activeOccupancy, currentVenue.capacity) } : currentVenue };
    });
  }

  async getMyActiveCheckin(userId: string) {
    const now = new Date();
    const checkin = await this.prisma.checkin.findFirst({ where: { userId, checkedOutAt: null, expiresAt: { gt: now } }, include: { venue: { select: { id: true, name: true, category: true, address: true, latitude: true, longitude: true, occupancy: true, capacity: true, image: true, rating: true, status: true } } }, orderBy: { checkedInAt: 'desc' } });
    if (!checkin) return checkin;
    const occupancy = await this.prisma.checkin.count({ where: { venueId: checkin.venueId, checkedOutAt: null, expiresAt: { gt: now } } });
    return { ...checkin, venue: { ...checkin.venue, occupancy, occupancyPercent: getOccupancyPercent(occupancy, checkin.venue?.capacity) } };
  }
  async getVenueCheckins(userId: string, venueId: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
    if (!venue) throw new NotFoundException('Local não encontrado.');
    return this.prisma.checkin.findMany({ where: { venueId, checkedOutAt: null, expiresAt: { gt: new Date() } }, include: { user: { select: userSelect } }, orderBy: { checkedInAt: 'desc' } });
  }

  async checkout(userId: string, venueId: string) {
    const now = new Date();
    return serializableTransaction(this.prisma, async (tx) => {
      const checkin = await tx.checkin.findFirst({ where: { userId, venueId, checkedOutAt: null, expiresAt: { gt: now } }, orderBy: { checkedInAt: 'desc' } });
      if (!checkin) throw new NotFoundException('Check-in ativo não encontrado.');
      const updatedCheckin = await tx.checkin.update({ where: { id: checkin.id }, data: { checkedOutAt: now }, include: { user: { select: userSelect }, venue: { select: { id: true, name: true, occupancy: true, capacity: true } } } });
      const updatedVenue = await tx.venue.findUnique({ where: { id: venueId }, select: { id: true, name: true, occupancy: true, capacity: true } });
      const activeOccupancy = await tx.checkin.count({ where: { venueId, checkedOutAt: null, expiresAt: { gt: now } } });
      return { checkin: { ...updatedCheckin, venue: { ...updatedCheckin.venue, occupancy: activeOccupancy, occupancyPercent: getOccupancyPercent(activeOccupancy, updatedCheckin.venue?.capacity) } }, venue: updatedVenue ? { ...updatedVenue, occupancy: activeOccupancy, occupancyPercent: getOccupancyPercent(activeOccupancy, updatedVenue.capacity) } : updatedVenue };
    });
  }

  async getMyCheckinHistory(userId: string) {
    return this.prisma.checkin.findMany({ where: { userId }, include: { venue: { select: { id: true, name: true, category: true, address: true, image: true, rating: true } } }, orderBy: { checkedInAt: 'desc' } });
  }
}
