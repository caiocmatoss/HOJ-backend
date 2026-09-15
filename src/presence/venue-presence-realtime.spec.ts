import { PresenceGateway } from './presence.gateway';
import { VenuePresenceEvents } from '../realtime/venue-presence-events';

describe('venue presence realtime contract', () => {
  const makeGateway = () => {
    const prisma = { venue: { findUnique: jest.fn() } } as any;
    const events = new VenuePresenceEvents();
    const gateway: any = new PresenceGateway({ verifyAsync: jest.fn() } as any, prisma, events);
    const emit = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit })) };
    return { gateway, prisma, events, emit };
  };

  const socket = () => ({
    id: 'socket-1',
    data: { user: { id: 'user-1' } },
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
  }) as any;

  it('subscribes authenticated sockets to a validated venue room', async () => {
    const { gateway, prisma } = makeGateway();
    prisma.venue.findUnique.mockResolvedValue({ id: 'v1' });
    const client = socket();
    await expect(gateway.handleVenueSubscribe(client, { venueId: ' v1 ' })).resolves.toEqual({ event: 'venue:subscribed', data: { venueId: 'v1' } });
    expect(client.join).toHaveBeenCalledWith('venue:v1');
  });

  it('rejects invalid or unknown venues without joining arbitrary rooms', async () => {
    const { gateway, prisma } = makeGateway();
    const client = socket();
    await expect(gateway.handleVenueSubscribe(client, { venueId: 'missing' })).resolves.toMatchObject({ event: 'venue:error' });
    expect(client.join).not.toHaveBeenCalled();
    prisma.venue.findUnique.mockResolvedValue({ id: 'v1' });
    await expect(gateway.handleVenueSubscribe(client, { venueId: '' })).resolves.toMatchObject({ event: 'venue:error' });
  });

  it('unsubscribes idempotently from the derived room', async () => {
    const { gateway } = makeGateway();
    const client = socket();
    await gateway.handleVenueUnsubscribe(client, { venueId: 'v1' });
    await gateway.handleVenueUnsubscribe(client, { venueId: 'v1' });
    expect(client.leave).toHaveBeenCalledTimes(2);
    expect(client.leave).toHaveBeenCalledWith('venue:v1');
  });

  it('emits a room-scoped minimal signal containing only venueId', () => {
    const { events, gateway, emit } = makeGateway();
    events.emitChanged('v1');
    expect(gateway.server.to).toHaveBeenCalledWith('venue:v1');
    expect(emit).toHaveBeenCalledWith('venue:presence:changed', { venueId: 'v1' });
    expect(emit.mock.calls[0][1]).toEqual({ venueId: 'v1' });
  });
});
