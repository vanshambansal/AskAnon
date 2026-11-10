import { readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function files(dir, suffix) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name), suffix) : entry.name.endsWith(suffix) ? [join(dir, entry.name)] : []);
}
function run(command, args, cwd = root, shell = false) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell, windowsHide: true });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
const backend = join(root, 'backend');
const sources = files(join(backend, 'src'), '.js');
for (const source of sources) run(process.execPath, ['--check', source]);
console.log(`Backend syntax: ${sources.length} files checked.`);
run(process.execPath, ['--test', ...files(join(backend, 'test'), '.test.js')], backend);
run(process.execPath, ['--test', ...files(join(root, 'frontend', 'test'), '.test.mjs')], join(root, 'frontend'));
// Commands are fixed strings, with no interpolated user data. Windows runs npm.cmd through cmd.
run('npm', ['run', 'lint'], join(root, 'frontend'), process.platform === 'win32');
run('npm', ['run', 'build'], join(root, 'frontend'), process.platform === 'win32');
console.log('Local syntax, tests, lint and build passed. Live services require separate acceptance checks.');
