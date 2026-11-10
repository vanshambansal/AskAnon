// Read-only logical backup. Requires PostgreSQL's pg_dump on PATH.
// Passwords travel through the child environment, never command-line arguments.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const connection = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connection) throw new Error('Set DIRECT_URL or DATABASE_URL in backend/.env.');
const url = new URL(connection);
const directory = resolve(root, '.local-backups/database');
await mkdir(directory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = resolve(directory, `askanon-${stamp}.dump`);
const temporary = target + '.partial';
const result = await new Promise(resolveResult => {
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', temporary], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get('sslmode') || 'require', PGCONNECT_TIMEOUT: '15' }
  });
  // Intentionally do not forward provider output which could include connection details.
  child.stderr.resume();
  child.on('error', error => resolveResult({ missing: error.code === 'ENOENT', code: 1 }));
  child.on('close', code => resolveResult({ code }));
});
if (result.code !== 0) throw new Error(result.missing ? 'Install PostgreSQL client tools (pg_dump), then rerun. No backup was completed.' : 'Backup failed. Check database connectivity and pg_dump/server version compatibility. Any .partial file is not a completed backup.');
await rename(temporary, target);
await writeFile(target + '.json', JSON.stringify({ created_at: new Date().toISOString(), format: 'PostgreSQL custom archive', includes: 'Database schema/data including vectors and job records', excludes: ['Cloudinary original files', 'Clerk accounts', 'service secrets'], restore_tested: false }, null, 2));
console.log('Database backup completed in .local-backups/database. Copy it to secure off-site storage and rehearse restore into a separate database.');
