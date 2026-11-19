import { Router } from 'express';
import { db } from '../db.js';
import { badRequest, conflict, unauthorized } from '../errors.js';
import { hashPassword, verifyPassword, setSession, clearSession, publicUser, requireUser } from '../auth.js';
import { str, checkEmail, checkPassword, checkName, normalizePhone, phoneMessage } from '../validate.js';

export const authRouter = Router();

// POST /auth/register — anyone
authRouter.post('/auth/register', async (req, res) => {
  const email = str(req.body?.email).toLowerCase();
  const name = str(req.body?.name);
  const password = req.body?.password;
  const phone = normalizePhone(str(req.body?.phone));

  const fields = {};
  const e1 = checkEmail(email); if (e1) fields.email = e1;
  const e2 = checkPassword(password); if (e2) fields.password = e2;
  const e3 = checkName(name); if (e3) fields.name = e3;
  if (!phone) fields.phone = phoneMessage;
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);

  const hash = await hashPassword(password);
  try {
    const { lastId } = await db.run(
      'INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)',
      [email, hash, name, phone]);
    setSession(res, lastId);
    res.status(201).json({ user: publicUser(await db.get('SELECT * FROM users WHERE id = ?', [lastId])) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE') && String(err.message).includes('email')) {
      throw conflict('An account with this email already exists.', 'email_taken');
    }
    throw err;
  }
});

// POST /auth/login — anyone
authRouter.post('/auth/login', async (req, res) => {
  const email = str(req.body?.email).toLowerCase();
  const password = req.body?.password;
  const user = email ? await db.get('SELECT * FROM users WHERE email = ?', [email]) : null;
  // Same message for "no such email" and "wrong password", so emails can't be probed.
  if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.password_hash))) {
    throw unauthorized();
  }
  setSession(res, user.id);
  res.json({ user: publicUser(user) });
});

// POST /auth/logout — signed in
authRouter.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.status(204).end();
});

// GET /me — signed in
authRouter.get('/me', requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// PATCH /me — signed in. Edit name and phone.
authRouter.patch('/me', requireUser, async (req, res) => {
  const fields = {};
  const updates = {};
  if (req.body?.name !== undefined) {
    const name = str(req.body.name);
    const e = checkName(name); if (e) fields.name = e; else updates.name = name;
  }
  if (req.body?.phone !== undefined) {
    const phone = normalizePhone(str(req.body.phone));
    if (!phone) fields.phone = phoneMessage; else updates.phone = phone;
  }
  if (Object.keys(fields).length) throw badRequest('Please fix the highlighted fields.', fields);

  await db.run(
    'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?',
    [updates.name ?? null, updates.phone ?? null, req.user.id]);
  res.json({ user: publicUser(await db.get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
});
