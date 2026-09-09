export type StorageUploadInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type StorageUploadResult = {
  key: string;
  url: string;
  contentType: string;
  size: number;
};

export abstract class StorageService {
  abstract upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  abstract delete(key: string): Promise<void>;
  abstract getPublicUrl(key: string): string;
  abstract getKeyFromManagedUrl(url: string | null | undefined): string | null;
  abstract isManagedUrl(url: string | null | undefined): boolean;
}
