import sharp from 'sharp';
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const VENUE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = new Set(['image/jpeg','image/png','image/webp']);
const MIME_FORMAT: Record<string,string> = { jpeg:'image/jpeg', png:'image/png', webp:'image/webp' };
export async function normalizeImage(file:{buffer:Buffer;mimetype:string}, maxBytes=AVATAR_MAX_BYTES):Promise<Buffer>{
  if(!file?.buffer?.length||file.buffer.length>maxBytes) throw new Error('Invalid image file');
  if(!ALLOWED_IMAGE_MIME.has(file.mimetype)) throw new Error('Unsupported image MIME type');
  const image=sharp(file.buffer,{failOn:'error'}); const metadata=await image.metadata();
  if(!metadata.format||MIME_FORMAT[metadata.format]!==file.mimetype||!metadata.width||!metadata.height||metadata.width<32||metadata.height<32||metadata.width>8192||metadata.height>8192) throw new Error('Invalid image');
  return image.webp({quality:85}).toBuffer();
}
export const normalizeAvatar=(file:{buffer:Buffer;mimetype:string})=>normalizeImage(file,AVATAR_MAX_BYTES);