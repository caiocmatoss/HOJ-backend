import { NotFoundException } from '@nestjs/common';
import { CheckinsService } from './checkins.service';

function setup() {
  const prisma = {
    venue: { findUnique: jest.fn() },
    checkin: { count: jest.fn(), findMany: jest.fn() },
    friendship: { findMany: jest.fn() },
  };
  return { prisma, service: new CheckinsService(prisma as never) };
}

describe('safe venue presence', () => {
  it('returns zero and no friends when nobody is active', async () => {
    const { prisma, service } = setup(); prisma.venue.findUnique.mockResolvedValue({ id: 'v1' }); prisma.checkin.count.mockResolvedValue(0); prisma.friendship.findMany.mockResolvedValue([]);
    await expect(service.getVenuePresence('me', 'v1')).resolves.toEqual({ venueId: 'v1', count: 0, friendsPresent: [] });
  });
  it('counts all active users but exposes only accepted friends', async () => {
    const { prisma, service } = setup(); prisma.venue.findUnique.mockResolvedValue({ id: 'v1' }); prisma.checkin.count.mockResolvedValue(2); prisma.friendship.findMany.mockResolvedValue([{ requesterId: 'me', addresseeId: 'friend' }]); prisma.checkin.findMany.mockResolvedValue([{ checkedInAt: new Date(), user: { id: 'friend', name: 'Friend', avatar: null } }]);
    await expect(service.getVenuePresence('me', 'v1')).resolves.toMatchObject({ count: 2, friendsPresent: [{ id: 'friend', name: 'Friend', avatar: null }] });
    expect(prisma.checkin.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1', userId: { in: ['friend'], not: 'me' }, checkedOutAt: null }) }));
  });
  it('does not expose private user fields', async () => {
    const { prisma, service } = setup(); prisma.venue.findUnique.mockResolvedValue({ id: 'v1' }); prisma.checkin.count.mockResolvedValue(1); prisma.friendship.findMany.mockResolvedValue([{ requesterId: 'friend', addresseeId: 'me' }]); prisma.checkin.findMany.mockResolvedValue([{ checkedInAt: new Date(), user: { id: 'friend', name: 'Friend', avatar: 'a', email: 'private@example.com' } }]);
    const result = await service.getVenuePresence('me', 'v1'); expect(result.friendsPresent[0]).toEqual({ id: 'friend', name: 'Friend', avatar: 'a' }); expect(result.friendsPresent[0]).not.toHaveProperty('email');
  });
  it('uses only active check-ins and accepted friendships', async () => {
    const { prisma, service } = setup(); prisma.venue.findUnique.mockResolvedValue({ id: 'v1' }); prisma.checkin.count.mockResolvedValue(0); prisma.friendship.findMany.mockResolvedValue([]);
    await service.getVenuePresence('me', 'v1');
    expect(prisma.checkin.count).toHaveBeenCalledWith({ where: { venueId: 'v1', checkedOutAt: null, expiresAt: { gt: expect.any(Date) } } });
    expect(prisma.friendship.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ACCEPTED' }) }));
  });
  it('returns 404 for an unknown venue', async () => { const { prisma, service } = setup(); prisma.venue.findUnique.mockResolvedValue(null); await expect(service.getVenuePresence('me', 'missing')).rejects.toBeInstanceOf(NotFoundException); });
});
