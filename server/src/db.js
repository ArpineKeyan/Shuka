// Database access. Locally: a SQLite file in server/data/.
// In production: Turso (hosted SQLite), set by DATABASE_URL.
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

const remoteUrl = process.env.DATABASE_URL;
let url = remoteUrl;
if (!url) {
  const dir = path.resolve(process.env.DATA_DIR || 'data');
  fs.mkdirSync(dir, { recursive: true });
  url = 'file:' + path.join(dir, 'shuka.db');
}

export const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
export const isLocal = !remoteUrl;

if (isLocal) {
  await client.execute('PRAGMA journal_mode = WAL');   // readers don't block the writer
  await client.execute('PRAGMA busy_timeout = 5000');  // wait instead of "database is locked"
}
await client.execute('PRAGMA foreign_keys = ON');

// Turn a libsql row into a plain object, so it can be sent as JSON.
function plain(rs) {
  return rs.rows.map(r => Object.fromEntries(rs.columns.map(c => [c, r[c]])));
}

// Small helpers. Use ? placeholders, never string concatenation.
export const db = {
  async all(sql, args = []) { return plain(await client.execute({ sql, args })); },
  async get(sql, args = []) { return (await this.all(sql, args))[0] ?? null; },
  async run(sql, args = []) {
    const rs = await client.execute({ sql, args });
    return { changes: rs.rowsAffected, lastId: rs.lastInsertRowid == null ? null : Number(rs.lastInsertRowid) };
  },
};
