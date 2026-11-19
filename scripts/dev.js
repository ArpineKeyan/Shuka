// One command for local work: installs what's missing, prepares the database, starts the API and the website.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args, cwd) => {
  const r = spawnSync(npm, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

for (const dir of ['server', 'client']) {
  if (!fs.existsSync(`${dir}/node_modules`)) { console.log(`Installing ${dir} packages…`); run(['install'], dir); }
}
if (!fs.existsSync('server/.env')) fs.copyFileSync('server/.env.example', 'server/.env');
run(['run', 'seed'], 'server');   // creates tables and demo data; skips if data is already there

const procs = [
  spawn(npm, ['run', 'dev'], { cwd: 'server', stdio: 'inherit' }),
  spawn(npm, ['run', 'dev', '--', '--host'], { cwd: 'client', stdio: 'inherit' }),
];
console.log('\n  Website: http://localhost:5173   (API: http://localhost:3000/api)\n');
const stop = () => { procs.forEach(p => p.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach(p => p.on('exit', code => { if (code) stop(); }));
