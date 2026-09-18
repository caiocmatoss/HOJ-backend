import { LocationRevocationEvents } from '../realtime/location-revocation-events';
import { LocationsService } from './locations.service';

describe('LocationsService preference revocation', () => {
  function createService(previousShareWithFriends: boolean | null) {
    const emitRevoked = jest.fn();
    const prisma = {
      locationPreferences: {
        findUnique: jest.fn().mockResolvedValue(
          previousShareWithFriends === null
            ? null
            : { shareWithFriends: previousShareWithFriends },
        ),
        upsert: jest.fn().mockResolvedValue({ shareWithFriends: false }),
      },
    } as any;
    const events = { emitRevoked } as unknown as LocationRevocationEvents;
    const service = new LocationsService(prisma, events);
    return { service, prisma, emitRevoked };
  }

  it('emits only after a persisted true to false transition', async () => {
    const { service, prisma, emitRevoked } = createService(true);

    await service.updatePreferences('user-1', { shareWithFriends: false });

    expect(prisma.locationPreferences.upsert).toHaveBeenCalledTimes(1);
    expect(emitRevoked).toHaveBeenCalledTimes(1);
    expect(emitRevoked).toHaveBeenCalledWith('user-1');
    expect(
      prisma.locationPreferences.upsert.mock.invocationCallOrder[0],
    ).toBeLessThan(emitRevoked.mock.invocationCallOrder[0]);
  });

  it.each([
    ['false to false', false, false],
    ['true to true', true, true],
    ['false to true', false, true],
    ['missing preferences to false', null, false],
  ])('does not emit for %s', async (_label, previous, next) => {
    const { service, emitRevoked } = createService(previous);

    await service.updatePreferences('user-1', { shareWithFriends: next });

    expect(emitRevoked).not.toHaveBeenCalled();
  });

  it('does not emit when preference persistence fails', async () => {
    const { service, prisma, emitRevoked } = createService(true);
    prisma.locationPreferences.upsert.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      service.updatePreferences('user-1', { shareWithFriends: false }),
    ).rejects.toThrow('database unavailable');
    expect(emitRevoked).not.toHaveBeenCalled();
  });

  it('resolves both accepted friendship directions and excludes other states', async () => {
    const { service, prisma } = createService(false);
    prisma.friendship = {
      findMany: jest.fn().mockResolvedValue([
        { requesterId: 'user-1', addresseeId: 'accepted-a' },
        { requesterId: 'accepted-b', addresseeId: 'user-1' },
      ]),
    };

    await expect(service.getAcceptedFriendIds('user-1')).resolves.toEqual([
      'accepted-a',
      'accepted-b',
    ]);
    expect(prisma.friendship.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: 'user-1' },
          { addresseeId: 'user-1' },
        ],
      },
      select: {
        requesterId: true,
        addresseeId: true,
      },
    });
  });
});
