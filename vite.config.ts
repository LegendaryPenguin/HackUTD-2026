import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(__dirname, 'data')
const REQUIRED = ['network.json', 'ops.json', 'telemetry.csv']

/** Serves ./data/<folder>/{network.json,ops.json,telemetry.csv} and an index of folders. Drop test/ in and it appears. */
function datasetServer(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      const url = (req.url ?? '').split('?')[0]
      if (!url.startsWith('/data/')) return next()
      if (url === '/data/index.json') {
        const folders = fs.existsSync(DATA_DIR)
          ? fs
              .readdirSync(DATA_DIR, { withFileTypes: true })
              .filter((d) => d.isDirectory() && REQUIRED.every((f) => fs.existsSync(path.join(DATA_DIR, d.name, f))))
              .map((d) => d.name)
              .sort((a, b) => (a === 'test' ? 1 : b === 'test' ? -1 : a.localeCompare(b)))
          : []
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(folders))
        return
      }
      const rel = decodeURIComponent(url.slice('/data/'.length))
      const [folder, file] = rel.split('/')
      if (!folder || !file || !REQUIRED.includes(file)) {
        res.statusCode = 404
        res.end('not found')
        return
      }
      const p = path.join(DATA_DIR, folder, file)
      if (!p.startsWith(DATA_DIR) || !fs.existsSync(p)) {
        res.statusCode = 404
        res.end('not found')
        return
      }
      res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'text/csv')
      res.setHeader('Content-Length', String(fs.statSync(p).size))
      fs.createReadStream(p).pipe(res)
    })
  }
  return {
    name: 'avon-dataset-server',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

export default defineConfig({
  plugins: [react(), datasetServer()],
  server: { port: 5173 },
})
