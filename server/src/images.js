// Product photos: check the real file type, resize to two sizes, store them.
// Locally the files go to server/data/uploads/. With Cloudinary keys set, they go to Cloudinary.
// The database only keeps a short key like "p12/k3j9x2", never the image itself.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { DATA_DIR } from './db.js';
import { badRequest } from './errors.js';
import { cloudinaryEnabled, uploadToCloudinary, deleteFromCloudinary, cloudinaryUrl } from './cloudinary.js';

export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const MAX_FILE_BYTES = 8 * 1024 * 1024;   // 8 MB
export const MAX_IMAGES = 5;
const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const SIZES = { thumb: { width: 400, height: 400, fit: 'cover' }, large: { width: 1200, height: 1200, fit: 'inside' } };

// Reads the file's real content, not its name or the browser's claimed type,
// so a renamed .exe is rejected.
export async function processImage(buffer, originalName = 'file') {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw badRequest(`"${originalName}" is not an image. Use JPG, PNG or WebP.`);
  }
  if (!ALLOWED.has(meta.format)) {
    throw badRequest(`"${originalName}" is a ${meta.format} file. Use JPG, PNG or WebP.`);
  }
  const out = {};
  for (const [name, size] of Object.entries(SIZES)) {
    out[name] = await sharp(buffer).rotate()                       // respect phone camera orientation
      .resize({ ...size, withoutEnlargement: size.fit === 'inside' })
      .webp({ quality: 80 }).toBuffer();
  }
  return out;
}

export function newImageKey(productId) {
  return `p${productId}/${crypto.randomBytes(6).toString('base64url')}`;
}

export async function storeImage(key, { thumb, large }) {
  if (cloudinaryEnabled) {
    await Promise.all([
      uploadToCloudinary(thumb, `shuka/${key}_thumb`),
      uploadToCloudinary(large, `shuka/${key}_large`),
    ]);
    return;
  }
  const dir = path.join(UPLOADS_DIR, path.dirname(key));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, `${key}_thumb.webp`), thumb);
  await fs.writeFile(path.join(UPLOADS_DIR, `${key}_large.webp`), large);
}

export async function removeImage(key) {
  try {
    if (cloudinaryEnabled) {
      await Promise.all([deleteFromCloudinary(`shuka/${key}_thumb`), deleteFromCloudinary(`shuka/${key}_large`)]);
    } else {
      await fs.rm(path.join(UPLOADS_DIR, `${key}_thumb.webp`), { force: true });
      await fs.rm(path.join(UPLOADS_DIR, `${key}_large.webp`), { force: true });
    }
  } catch (err) {
    console.warn('Could not delete image files for', key, err.message);   // the DB row is already gone; not fatal
  }
}

export function imageUrls(key) {
  if (!key) return null;
  if (cloudinaryEnabled) {
    return { thumb: cloudinaryUrl(`shuka/${key}_thumb`), large: cloudinaryUrl(`shuka/${key}_large`) };
  }
  return { thumb: `/api/uploads/${key}_thumb.webp`, large: `/api/uploads/${key}_large.webp` };
}
