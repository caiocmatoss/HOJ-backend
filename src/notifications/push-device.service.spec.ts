jest.mock('expo-server-sdk', () => ({ __esModule: true, default: { isExpoPushToken: (token: unknown) => typeof token === 'string' && token.startsWith('ExpoPushToken[') && token.endsWith(']') } }));

import { NotFoundException } from '@nestjs/common';
import { PushPlatform } from '../../generated/prisma/client';
import { PushDeviceService } from './push-device.service';

describe('PushDeviceService', () => {
  const pushDevice = {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  let service: PushDeviceService;
  const pushService = { isValidToken: jest.fn(() => true) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PushDeviceService({ pushDevice } as never, pushService as never);
  });

  const device = (overrides = {}) => ({
    id: 'device-1', platform: PushPlatform.IOS, createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'), lastUsedAt: new Date('2026-01-02'), disabledAt: null, ...overrides,
  });

  it('registers safely and returns no token or userId', async () => {
    pushDevice.upsert.mockResolvedValue(device());
    const result = await service.register('user-a', { token: 'secret-token', platform: PushPlatform.IOS });
    expect(pushDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { token: 'secret-token' }, update: expect.objectContaining({ userId: 'user-a', disabledAt: null }) }));
    expect(result).toEqual(expect.objectContaining({ id: 'device-1', platform: PushPlatform.IOS, enabled: true }));
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('userId');
  });

  it('uses token upsert for idempotency, reassignment and reactivation', async () => {
    pushDevice.upsert.mockResolvedValue(device({ platform: PushPlatform.ANDROID }));
    await service.register('user-b', { token: 'same', platform: PushPlatform.ANDROID });
    expect(pushDevice.upsert).toHaveBeenCalledTimes(1);
    expect(pushDevice.upsert.mock.calls[0][0].update).toEqual(expect.objectContaining({ userId: 'user-b', disabledAt: null }));
  });

  it('lists only active devices for the authenticated user in deterministic order', async () => {
    pushDevice.findMany.mockResolvedValue([device()]);
    const result = await service.listMine('user-a');
    expect(pushDevice.findMany).toHaveBeenCalledWith({ where: { userId: 'user-a', disabledAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('token');
    expect(result[0]).not.toHaveProperty('userId');
  });

  it('disables an owned device and is idempotent when already disabled', async () => {
    pushDevice.findFirst.mockResolvedValueOnce(device()).mockResolvedValueOnce(device({ disabledAt: new Date() }));
    await service.disableMine('user-a', 'device-1');
    await service.disableMine('user-a', 'device-1');
    expect(pushDevice.update).toHaveBeenCalledTimes(1);
  });

  it('hides missing or foreign devices as not found', async () => {
    pushDevice.findFirst.mockResolvedValue(null);
    await expect(service.disableMine('user-b', 'device-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});