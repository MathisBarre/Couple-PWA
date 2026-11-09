// Génère public/og-image.png (1200×630) depuis scripts/og/og-image.html avec Playwright (Chromium).
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const dir = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(path.join(dir, 'og-image.html')).href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: path.join(dir, '../../public/og-image.png') })
await browser.close()
