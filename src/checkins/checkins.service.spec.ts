import { CheckinsService } from './checkins.service';

function txMock() {
  return {
    checkin: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    venue: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn(), findUnique: jest.fn() },
  };
}

describe('CheckinsService lifecycle transitions', () => {
  const venue = { id: 'v1' };
  it('creates the first check-in with an expiry', async () => {
    const tx = txMock();
    tx.checkin.findFirst.mockResolvedValue(null); tx.checkin.create.mockResolvedValue({ id: 'c1', expiresAt: new Date() }); tx.venue.update.mockResolvedValue({ id: 'v1', occupancy: 1 });
    const prisma = { venue: { findUnique: jest.fn().mockResolvedValue(venue) }, $transaction: jest.fn((cb: any) => cb(tx)) };
    const result = await new CheckinsService(prisma as never).create('u1', 'v1');
    expect(tx.checkin.create).toHaveBeenCalled(); expect(result.checkin).toBeDefined();
  });
  it('renews same-venue check-in without creating another row', async () => {
    const tx = txMock(); tx.checkin.findFirst.mockResolvedValue({ id: 'c1', venueId: 'v1' }); tx.checkin.update.mockResolvedValue({ id: 'c1' }); tx.venue.findUnique.mockResolvedValue({ id: 'v1', occupancy: 1 });
    const prisma = { venue: { findUnique: jest.fn().mockResolvedValue(venue) }, $transaction: jest.fn((cb: any) => cb(tx)) };
    await new CheckinsService(prisma as never).create('u1', 'v1');
    expect(tx.checkin.create).not.toHaveBeenCalled(); expect(tx.checkin.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ expiresAt: expect.any(Date) }) }));
  });
  it('closes the previous venue before switching', async () => {
    const tx = txMock(); tx.checkin.findFirst.mockResolvedValue({ id: 'c1', venueId: 'old' }); tx.checkin.update.mockResolvedValue({}); tx.checkin.create.mockResolvedValue({ id: 'c2' }); tx.venue.update.mockResolvedValue({ id: 'v1', occupancy: 1 });
    const prisma = { venue: { findUnique: jest.fn().mockResolvedValue(venue) }, $transaction: jest.fn((cb: any) => cb(tx)) };
    await new CheckinsService(prisma as never).create('u1', 'v1');
    expect(tx.checkin.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { checkedOutAt: expect.any(Date) } }); expect(tx.checkin.create).toHaveBeenCalled();
  });
  it('checks out an active check-in while preserving its row', async () => {
    const tx = txMock(); tx.checkin.findFirst.mockResolvedValue({ id: 'c1' }); tx.checkin.update.mockResolvedValue({ id: 'c1', checkedOutAt: new Date() }); tx.venue.findUnique.mockResolvedValue({ id: 'v1', occupancy: 0 });
    const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) };
    await new CheckinsService(prisma as never).checkout('u1', 'v1');
    expect(tx.checkin.update).toHaveBeenCalledWith(expect.objectContaining({ data: { checkedOutAt: expect.any(Date) } }));
  });
});