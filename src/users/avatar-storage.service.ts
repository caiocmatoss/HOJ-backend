import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { normalizeAvatar } from '../storage/image-validator';
import { StorageService, StorageUploadResult } from '../storage/storage.service';

@Injectable()
export class AvatarStorageService {
  constructor(private readonly storage: StorageService) {}
  async save(userId: string, file: { buffer: Buffer; mimetype: string }): Promise<StorageUploadResult> {
    const body = await normalizeAvatar(file);
    return this.storage.upload({ key: `users/${userId}/avatar/${randomUUID()}.webp`, body, contentType: 'image/webp' });
  }
  async deleteManaged(reference: string | null | undefined): Promise<void> {
    const key = this.storage.getKeyFromManagedUrl(reference);
    if (key) await this.storage.delete(key);
  }
}