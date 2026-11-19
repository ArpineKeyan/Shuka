// Minimal Cloudinary client using its REST API (no SDK needed).
import crypto from 'node:crypto';

const cloud = process.env.CLOUDINARY_CLOUD_NAME;
const key = process.env.CLOUDINARY_API_KEY;
const secret = process.env.CLOUDINARY_API_SECRET;
export const cloudinaryEnabled = Boolean(cloud && key && secret);

function signed(params) {
  const timestamp = Math.floor(Date.now() / 1000);
  const all = { ...params, timestamp };
  const toSign = Object.keys(all).sort().map(k => `${k}=${all[k]}`).join('&');
  const signature = crypto.createHash('sha1').update(toSign + secret).digest('hex');
  return { ...all, api_key: key, signature };
}

async function post(action, form) {
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/${action}`, { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Cloudinary ${action} failed: ${body.error?.message || res.status}`);
  return body;
}

export async function uploadToCloudinary(buffer, publicId) {
  const form = new FormData();
  for (const [k, v] of Object.entries(signed({ public_id: publicId, overwrite: 'true' }))) form.append(k, String(v));
  form.append('file', new Blob([buffer], { type: 'image/webp' }), 'image.webp');
  return post('upload', form);
}

export async function deleteFromCloudinary(publicId) {
  const form = new FormData();
  for (const [k, v] of Object.entries(signed({ public_id: publicId }))) form.append(k, String(v));
  return post('destroy', form);
}

export const cloudinaryUrl = publicId => `https://res.cloudinary.com/${cloud}/image/upload/${publicId}.webp`;
