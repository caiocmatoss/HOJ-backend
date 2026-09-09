import { Module } from '@nestjs/common';
import { storageConfig } from '../config/storage-config';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { StorageService } from './storage.service';

@Module({
  providers: [
    LocalStorageAdapter,
    S3StorageAdapter,
    { provide: StorageService, useFactory: () => storageConfig().driver === 's3' ? new S3StorageAdapter() : new LocalStorageAdapter() },
  ],
  exports: [StorageService],
})
export class StorageModule {}
