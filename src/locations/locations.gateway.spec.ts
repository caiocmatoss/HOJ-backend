import { LocationsGateway } from './locations.gateway';

describe('LocationsGateway privacy', () => {
  function createGateway(canShare: boolean) {
    const emit = jest.fn();
    const toEmit = jest.fn();
    const gateway = new LocationsGateway(
      { update: jest.fn().mockResolvedValue({ updatedAt: new Date('2026-09-17T12:00:00.000Z') }), canShareWithFriends: jest.fn().mockResolvedValue(canShare) } as any,
      { getNearbyFriends: jest.fn().mockResolvedValue({ friends: [{ id: 'friend', distanceMeters: 100, distanceKm: 0.1 }], count: 1 }) } as any,
      {} as any,
      {} as any,
    );
    gateway.server = { to: jest.fn(() => ({ emit: toEmit })) } as any;
    return { gateway, emit, toEmit };
  }

  it('does not send location to friends when sharing is disabled', async () => {
    const { gateway, toEmit } = createGateway(false);
    const client = { data: { user: { id: 'self' } }, emit: jest.fn() } as any;
    await gateway.handleUpdate(client, { latitude: -23.550519, longitude: -46.633308 }, jest.fn());
    expect(toEmit).not.toHaveBeenCalled();
  });

  it('sends only approximate coordinates to authorized friends', async () => {
    const { gateway, toEmit } = createGateway(true);
    const client = { data: { user: { id: 'self' } }, emit: jest.fn() } as any;
    await gateway.handleUpdate(client, { latitude: -23.550519, longitude: -46.633308 }, jest.fn());
    expect(toEmit).toHaveBeenCalledWith('location:updated', expect.objectContaining({ latitude: -23.551, longitude: -46.633 }));
    const payload = toEmit.mock.calls[0][1];
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('bio');
  });
});
