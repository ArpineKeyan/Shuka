// Applies numbered .sql files from server/migrations once each, in order.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { client, db } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate() {
  await client.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT`);
  const done = new Set((await db.all('SELECT name FROM _migrations')).map(r => r.name));
  const files = fs.readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await client.executeMultiple(fs.readFileSync(path.join(dir, f), 'utf8'));
    await db.run('INSERT INTO _migrations VALUES (?, ?)', [f, new Date().toISOString()]);
    console.log('applied', f);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  console.log('migrations up to date');
}
