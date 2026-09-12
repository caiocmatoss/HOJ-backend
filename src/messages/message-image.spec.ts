import { MessagesService } from './messages.service';
import sharp from 'sharp';

describe('group image persistence cleanup', () => {
  it('removes only the newly uploaded asset when message persistence fails', async () => {
    const prisma: any = {
      group: { findUnique: jest.fn().mockResolvedValue({ id: 'g' }) },
      groupMember: { findUnique: jest.fn().mockResolvedValue({ groupId: 'g', userId: 'u' }) },
      message: { create: jest.fn().mockRejectedValue(new Error('db failure')) },
    };
    const notifications: any = { createMany: jest.fn() };
    const events: any = { emitCreated: jest.fn() };
    const storage: any = { upload: jest.fn().mockResolvedValue({ key: 'messages/group/g/new.webp', url: 'https://cdn/new.webp' }), delete: jest.fn() };
    const service = new MessagesService(prisma, notifications, events, storage);
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: 'red' } }).png().toBuffer();
    await expect(service.createImage('u', 'g', '', { buffer, mimetype: 'image/png' })).rejects.toThrow('db failure');
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith('messages/group/g/new.webp');
  });
});
