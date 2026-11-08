/**
 * Copy data/<folder>/{network,ops,telemetry} into public/data for static hosts (Vercel).
 * Dev still uses the Vite datasetServer middleware against ./data.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = path.join(root, 'data')
const outRoot = path.join(root, 'public', 'data')
const REQUIRED = ['network.json', 'ops.json', 'telemetry.csv']

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

if (!fs.existsSync(srcRoot)) {
  console.warn('prepare-public-data: no ./data folder — skipping')
  process.exit(0)
}

fs.rmSync(outRoot, { recursive: true, force: true })
fs.mkdirSync(outRoot, { recursive: true })

const folders = fs
  .readdirSync(srcRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && REQUIRED.every((f) => fs.existsSync(path.join(srcRoot, d.name, f))))
  .map((d) => d.name)
  .sort((a, b) => (a === 'test' ? 1 : b === 'test' ? -1 : a.localeCompare(b)))

for (const name of folders) {
  for (const file of REQUIRED) {
    copyFile(path.join(srcRoot, name, file), path.join(outRoot, name, file))
  }
  console.log(`  + ${name}`)
}

fs.writeFileSync(path.join(outRoot, 'index.json'), JSON.stringify(folders))
console.log(`prepare-public-data: ${folders.length} dataset(s) → public/data`)
