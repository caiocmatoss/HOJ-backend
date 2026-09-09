import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { storageConfig, joinStorageUrl, type StorageConfig } from '../config/storage-config';
import { StorageService, type StorageUploadInput, type StorageUploadResult } from './storage.service';

function safeKey(key: string): string {
  if (!key || key.includes('\\') || key.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Invalid storage key');
  return key;
}

@Injectable()
export class LocalStorageAdapter extends StorageService {
  private readonly config: StorageConfig = storageConfig();
  private readonly root = resolve(process.cwd(), this.config.localRoot);

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const key = safeKey(input.key);
    const target = resolve(this.root, key);
    if (relative(this.root, target).startsWith('..') || isAbsolute(relative(this.root, target))) throw new Error('Invalid storage key');
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, input.body, { flag: 'wx' });
    return { key, url: this.getPublicUrl(key), contentType: input.contentType, size: input.body.length };
  }

  async delete(key: string): Promise<void> {
    const safe = safeKey(key);
    const target = resolve(this.root, safe);
    if (relative(this.root, target).startsWith('..')) throw new Error('Invalid storage key');
    try { await unlink(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  getPublicUrl(key: string): string { return joinStorageUrl(this.config.publicBaseUrl, safeKey(key)); }
  getKeyFromManagedUrl(url: string | null | undefined): string | null {
    if (!url || !this.isManagedUrl(url)) return null;
    const prefix = `${this.config.publicBaseUrl.replace(/\/+$/, '')}/`;
    return decodeURIComponent(url.slice(prefix.length));
  }
  isManagedUrl(url: string | null | undefined): boolean {
    return !!url && url.startsWith(`${this.config.publicBaseUrl.replace(/\/+$/, '')}/`);
  }
}
