import { Test, TestingModule } from '@nestjs/testing';

import { FriendsService } from './friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FRIEND_LOCATION_MAX_AGE_MS } from '../locations/location-privacy';

describe('FriendsService', () => {
  let service: FriendsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FriendsService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: NotificationsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<FriendsService>(FriendsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns only accepted, sharing, fresh friends with approximate coordinates', async () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const prisma = {
      userLocation: {
        findUnique: jest.fn().mockResolvedValue({ latitude: -23.55, longitude: -46.63 }),
        findMany: jest.fn().mockResolvedValue([
          {
            latitude: -23.550519,
            longitude: -46.633308,
            updatedAt: new Date(now.getTime() - FRIEND_LOCATION_MAX_AGE_MS + 1),
            user: { id: 'friend', name: 'Amigo', avatar: null, status: 'ONLINE', privacyPreferences: { showStatus: true }, locationPreferences: { shareWithFriends: true } },
          },
          {
            latitude: -23.55,
            longitude: -46.63,
            updatedAt: new Date(now.getTime() - FRIEND_LOCATION_MAX_AGE_MS - 1),
            user: { id: 'stale', name: 'Antigo', avatar: null, status: 'ONLINE', privacyPreferences: { showStatus: true }, locationPreferences: { shareWithFriends: true } },
          },
          {
            latitude: -23.55,
            longitude: -46.63,
            updatedAt: now,
            user: { id: 'private', name: 'Privado', avatar: null, status: 'ONLINE', privacyPreferences: { showStatus: true }, locationPreferences: { shareWithFriends: false } },
          },
          {
            latitude: -23.55,
            longitude: -46.63,
            updatedAt: now,
            user: { id: 'unset', name: 'Sem preferência', avatar: null, status: 'ONLINE', privacyPreferences: { showStatus: true }, locationPreferences: null },
          },
        ]),
      },
      friendship: {
        findMany: jest.fn().mockResolvedValue([{ requesterId: 'me', addresseeId: 'friend' }, { requesterId: 'me', addresseeId: 'stale' }, { requesterId: 'me', addresseeId: 'private' }, { requesterId: 'me', addresseeId: 'unset' }]),
      },
    };
    Object.assign(service, { prisma });

    await expect(service.getNearbyFriends('me', 10)).resolves.toMatchObject({
      count: 1,
      friends: [{ id: 'friend', latitude: -23.551, longitude: -46.633 }],
    });
    const result = await service.getNearbyFriends('me', 10);
    expect(result.friends[0]).not.toHaveProperty('email');
    expect(result.friends[0]).not.toHaveProperty('bio');
    jest.useRealTimers();
  });
});
