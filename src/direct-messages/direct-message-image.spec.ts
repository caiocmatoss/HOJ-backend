import { DirectMessagesService } from './direct-messages.service';
import sharp from 'sharp';

describe('direct image persistence cleanup', () => {
  it('removes only the newly uploaded asset when message persistence fails', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', name: 'User' }) },
      friendship: { findFirst: jest.fn().mockResolvedValue({ id: 'f' }) },
      directMessage: { create: jest.fn().mockRejectedValue(new Error('db failure')) },
    };
    const notifications: any = { create: jest.fn() };
    const events: any = { emitCreated: jest.fn() };
    const storage: any = { upload: jest.fn().mockResolvedValue({ key: 'messages/direct/u/new.webp', url: 'https://cdn/new.webp' }), delete: jest.fn() };
    const service = new DirectMessagesService(prisma, notifications, events, storage);
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: 'red' } }).png().toBuffer();
    await expect(service.createImage('u', 'peer', '', { buffer, mimetype: 'image/png' })).rejects.toThrow('db failure');
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith('messages/direct/u/new.webp');
  });
});
