/**
 * Sanity-check detector + planner math against full_week / mock datasets.
 * Run: node scripts/verify-math.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadDataset(name) {
  const base = join(root, 'data', name);
  const network = JSON.parse(readFileSync(join(base, 'network.json'), 'utf8'));
  const ops = JSON.parse(readFileSync(join(base, 'ops.json'), 'utf8'));
  // Use built dist? Prefer dynamic import of compiled - instead spawn tsx.
  return { name, network, ops, base };
}

const name = existsSync(join(root, 'data/full_week/network.json')) ? 'full_week' : 'mock_test_2026-10-10T1530';
console.log('Dataset:', name);

// Delegate to tsx runner for typed modules
import { spawnSync } from 'child_process';
const r = spawnSync('npx', ['tsx', join(root, 'scripts/verify-math.ts'), name], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
});
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
process.exit(r.status ?? 1);
