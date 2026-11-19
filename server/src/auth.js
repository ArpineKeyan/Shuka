// Passwords: scrypt (built into Node). Sessions: a signed, httpOnly cookie.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';
import { unauthorized, forbidden } from './errors.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'shuka_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days

const SECRET = process.env.SESSION_SECRET;
if (!SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET must be set in production');
}
const secret = SECRET || 'dev-only-secret';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [, saltB64, keyB64] = stored.split('$');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), 64);
  return crypto.timingSafeEqual(key, Buffer.from(keyB64, 'base64'));
}

// Cookie value: "<userId>.<expiresAt>.<signature>"
function sign(data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

export function setSession(res, userId) {
  const expires = Date.now() + MAX_AGE_MS;
  const data = `${userId}.${expires}`;
  res.cookie(COOKIE, `${data}.${sign(data)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readSession(req) {
  const value = req.cookies?.[COOKIE];
  if (!value) return null;
  const [id, expires, sig] = value.split('.');
  if (!id || !expires || !sig) return null;
  const expected = sign(`${id}.${expires}`);
  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(expires) < Date.now()) return null;
  return Number(id);
}

export const publicUser = u => u && ({
  id: u.id, email: u.email, name: u.name, phone: u.phone,
  storeName: u.store_name, isSeller: u.store_name != null,
});

// Runs on every request: sets req.user if the cookie is valid.
export async function loadUser(req, _res, next) {
  const id = readSession(req);
  req.user = id ? await db.get('SELECT * FROM users WHERE id = ?', [id]) : null;
  next();
}

export function requireUser(req, _res, next) {
  if (!req.user) throw unauthorized();
  next();
}

export function requireSeller(req, _res, next) {
  if (!req.user) throw unauthorized();
  if (req.user.store_name == null) throw forbidden('Become a seller first.');
  next();
}
