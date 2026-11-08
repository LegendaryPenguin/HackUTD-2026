import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve('dist')
const mobile = path.join(dist, 'mobile.html')
const index = path.join(dist, 'index.html')

if (!fs.existsSync(mobile)) {
  console.error('promote-mobile-index: dist/mobile.html missing')
  process.exit(1)
}

fs.copyFileSync(mobile, index)
console.log('promote-mobile-index: wrote dist/index.html from mobile.html')
