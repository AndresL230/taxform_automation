// Manual screenshot-capture script. NOT part of the test suite.
// Drives the running app with Playwright and writes the guide screenshots to public/guide/.
//
// Run: start the app first in another terminal (for example `npm run dev`), then:
//   GUIDE_BASE_URL=http://localhost:5173 npm run capture-guide
// GUIDE_BASE_URL defaults to http://localhost:5173. Point it at whatever port the
// dev server is actually serving (Vite picks the next free port if 5173 is taken).
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.env.GUIDE_BASE_URL ?? 'http://localhost:5173'
const outDir = fileURLToPath(new URL('../public/guide/', import.meta.url))
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()

// Step 1: the upload area at the top of the tool.
await page.goto(`${baseUrl}/app`, { waitUntil: 'networkidle' })
await page.getByTestId('upload-zone').screenshot({ path: `${outDir}step-1-upload.png` })
console.log('captured step-1-upload.png')

// Step 2: the document list with mixed statuses.
await page.getByText('Review →').first().waitFor()
await page.screenshot({ path: `${outDir}step-2-extraction.png` })
console.log('captured step-2-extraction.png')

// Step 3: the review screen (blurry W-2, needs review). Wait for the PDF canvas to render.
await page.goto(`${baseUrl}/review/doc-jdoe`, { waitUntil: 'networkidle' })
await page.getByTestId('pdf-canvas').waitFor()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${outDir}step-3-review.png` })
console.log('captured step-3-review.png')

// Step 4: the export menu open on a reviewed W-2.
await page.goto(`${baseUrl}/review/doc-acme`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /export/i }).click()
await page.getByText('JSON').waitFor()
await page.screenshot({ path: `${outDir}step-4-export.png` })
console.log('captured step-4-export.png')

await browser.close()
console.log('done')
