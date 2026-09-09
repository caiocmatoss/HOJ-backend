import { Injectable } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { joinStorageUrl, storageConfig } from '../config/storage-config';
import { StorageService, StorageUploadInput, StorageUploadResult } from './storage.service';
function safeKey(key: string): string { if (!key || key.includes('\\') || key.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('Invalid storage key'); return key; }
@Injectable()
export class S3StorageAdapter extends StorageService {
  private readonly config = storageConfig();
  private readonly client = new S3Client({ region: this.config.s3Region, endpoint: this.config.s3Endpoint, forcePathStyle: this.config.s3ForcePathStyle, credentials: { accessKeyId: this.config.s3AccessKeyId!, secretAccessKey: this.config.s3SecretAccessKey! } });
  async upload(input: StorageUploadInput): Promise<StorageUploadResult> { const key=safeKey(input.key); await this.client.send(new PutObjectCommand({Bucket:this.config.s3Bucket,Key:key,Body:input.body,ContentType:input.contentType})); return {key,url:this.getPublicUrl(key),contentType:input.contentType,size:input.body.length}; }
  async delete(key:string):Promise<void>{await this.client.send(new DeleteObjectCommand({Bucket:this.config.s3Bucket,Key:safeKey(key)}));}
  getPublicUrl(key:string):string{return joinStorageUrl(this.config.publicBaseUrl,safeKey(key));}
  isManagedUrl(url:string|null|undefined):boolean{return !!url&&url.startsWith(`${this.config.publicBaseUrl}/`);}
  getKeyFromManagedUrl(url:string|null|undefined):string|null{return url&&this.isManagedUrl(url)?decodeURIComponent(url.slice(`${this.config.publicBaseUrl}/`.length)):null;}
}