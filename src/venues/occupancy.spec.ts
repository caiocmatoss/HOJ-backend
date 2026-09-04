import { VenuesService } from './venues.service';

describe('VenuesService derived occupancy', () => {
  const venue = { id: 'v1', name: 'Venue', category: 'Bar', address: 'Rua', latitude: -23, longitude: -46, occupancy: 99, capacity: null, source: 'MANUAL' as const, externalProvider: null, externalId: null, locality: null, region: null, country: null, postcode: null, phone: null, website: null, sourceRefreshedAt: null, sourceClosedAt: null, description: null, image: null, rating: null, dj: null, promotion: null, playlist: null, status: 'OPEN' as const, images: [] };
  it('uses one grouped active-checkin query for list and ignores persisted counter', async () => {
    const prisma = { venue: { findMany: jest.fn().mockResolvedValue([venue]) }, checkin: { groupBy: jest.fn().mockResolvedValue([{ venueId: 'v1', _count: { _all: 3 } }]) } };
    const result = await new VenuesService(prisma as never).findAll({ limit: 100 });
    expect(result[0].occupancy).toBe(3); expect(prisma.checkin.groupBy).toHaveBeenCalledTimes(1);
  });
  it('returns zero when no temporal check-ins are active', async () => {
    const prisma = { venue: { findUnique: jest.fn().mockResolvedValue(venue) }, checkin: { count: jest.fn().mockResolvedValue(0) } };
    expect((await new VenuesService(prisma as never).findOne('v1')).occupancy).toBe(0);
    expect(prisma.checkin.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ checkedOutAt: null, expiresAt: expect.objectContaining({ gt: expect.any(Date) }) }) }));
  });
  it('counts manual and imported venues through the same grouped query', async () => {
    const imported = { ...venue, id: 'v2', source: 'IMPORTED' as const };
    const prisma = { venue: { findMany: jest.fn().mockResolvedValue([venue, imported]) }, checkin: { groupBy: jest.fn().mockResolvedValue([{ venueId: 'v1', _count: { _all: 1 } }, { venueId: 'v2', _count: { _all: 2 } }]) } };
    const result = await new VenuesService(prisma as never).findAll();
    expect(result.map((item) => item.occupancy)).toEqual([1, 2]);
  });
});