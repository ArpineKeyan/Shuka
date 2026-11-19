// Database access.
// Locally: Node's built-in SQLite, one file in server/data/.
// In production: Turso (hosted SQLite), when DATABASE_URL is set.
// Both give the same small async API: db.all / db.get / db.run / tx(fn).
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const remoteUrl = process.env.DATABASE_URL;
export const isLocal = !remoteUrl;

const toNum = v => (typeof v === 'bigint' ? Number(v) : v);
const plainRow = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toNum(v)]));

let backend;   // { all(sql,args), run(sql,args), exec(sql), begin(), commit(), rollback() }

if (isLocal) {
  const { DatabaseSync } = await import('node:sqlite');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const conn = new DatabaseSync(path.join(DATA_DIR, 'shuka.db'));
  conn.exec('PRAGMA journal_mode = WAL');    // readers don't block the writer
  conn.exec('PRAGMA busy_timeout = 5000');   // wait instead of "database is locked"
  conn.exec('PRAGMA foreign_keys = ON');     // off by default in SQLite
  conn.exec('PRAGMA synchronous = NORMAL');
  const cache = new Map();
  const stmt = sql => { let s = cache.get(sql); if (!s) { s = conn.prepare(sql); cache.set(sql, s); } return s; };
  backend = {
    async all(sql, args) { return stmt(sql).all(...args).map(plainRow); },
    async run(sql, args) {
      const r = stmt(sql).run(...args);
      return { changes: toNum(r.changes), lastId: toNum(r.lastInsertRowid) };
    },
    async exec(sql) { conn.exec(sql); },
    async transaction() {
      conn.exec('BEGIN IMMEDIATE');
      return { all: backend.all, run: backend.run,
               commit: async () => conn.exec('COMMIT'), rollback: async () => conn.exec('ROLLBACK') };
    },
  };
} else {
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: remoteUrl, authToken: process.env.DATABASE_AUTH_TOKEN });
  await client.execute('PRAGMA foreign_keys = ON');
  const wrap = ex => ({
    async all(sql, args) {
      const rs = await ex.execute({ sql, args });
      return rs.rows.map(r => plainRow(Object.fromEntries(rs.columns.map(c => [c, r[c]]))));
    },
    async run(sql, args) {
      const rs = await ex.execute({ sql, args });
      return { changes: rs.rowsAffected, lastId: rs.lastInsertRowid == null ? null : Number(rs.lastInsertRowid) };
    },
  });
  backend = {
    ...wrap(client),
    async exec(sql) { await client.executeMultiple(sql); },
    async transaction() {
      const t = await client.transaction('write');   // BEGIN IMMEDIATE on Turso
      return { ...wrap(t), commit: () => t.commit(), rollback: () => t.rollback(), close: () => t.close() };
    },
  };
}

// Locally there is one connection, so every query waits its turn in one queue:
// nothing can run in the middle of someone else's transaction.
// On Turso each plain query is separate and safe, so only transactions queue up.
let queue = Promise.resolve();
function enqueue(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}
const maybeQueue = fn => (isLocal ? enqueue(fn) : fn());

export const db = {
  all: (sql, args = []) => maybeQueue(() => backend.all(sql, args)),
  async get(sql, args = []) { return (await db.all(sql, args))[0] ?? null; },
  run: (sql, args = []) => maybeQueue(() => backend.run(sql, args)),
  exec: sql => maybeQueue(() => backend.exec(sql)),
};

// Runs fn inside one write transaction (BEGIN IMMEDIATE). If fn throws, everything is rolled back.
// Inside fn use only the handle t (t.all / t.get / t.run), never db.*, or it will wait forever.
// Keep it short: no file uploads or network calls inside.
export function tx(fn) {
  return enqueue(async () => {
    const t = await backend.transaction();
    const h = {
      all: (sql, args = []) => t.all(sql, args),
      get: async (sql, args = []) => (await t.all(sql, args))[0] ?? null,
      run: (sql, args = []) => t.run(sql, args),
    };
    try {
      const result = await fn(h);
      await t.commit();
      return result;
    } catch (err) {
      await t.rollback().catch(() => {});
      throw err;
    } finally {
      t.close?.();
    }
  });
}
