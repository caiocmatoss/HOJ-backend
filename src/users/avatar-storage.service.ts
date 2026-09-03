import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class AvatarStorageService {
  private readonly logger = new Logger(AvatarStorageService.name);
  private readonly directory = join(process.cwd(), 'uploads', 'avatars');

  async save(file: { buffer: Buffer; mimetype: string }): Promise<string> {
    const extension = EXTENSIONS[file.mimetype];
    if (!extension) throw new Error('Unsupported avatar MIME type');
    await mkdir(this.directory, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.directory, filename), file.buffer);
    return `/uploads/avatars/${filename}`;
  }

  async removeIfLocal(reference: string | null | undefined): Promise<void> {
    if (!reference?.startsWith('/uploads/avatars/')) return;
    const filename = reference.slice('/uploads/avatars/'.length);
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) return;
    try {
      await unlink(join(this.directory, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Não foi possível remover avatar anterior: ${filename}`);
      }
    }
  }
}
