/**
 * On the FlowState mobile Vercel project (FLOWSTATE_MOBILE=1),
 * replace dist/index.html with the PWA entry so "/" is mobile.
 */
import fs from 'node:fs'
import path from 'node:path'

if (process.env.FLOWSTATE_MOBILE !== '1') {
  process.exit(0)
}

const dist = path.resolve('dist')
const mobile = path.join(dist, 'mobile.html')
const index = path.join(dist, 'index.html')

if (!fs.existsSync(mobile)) {
  console.error('maybe-promote-mobile: dist/mobile.html missing')
  process.exit(1)
}

fs.copyFileSync(mobile, index)
console.log('maybe-promote-mobile: "/" now serves mobile PWA')
