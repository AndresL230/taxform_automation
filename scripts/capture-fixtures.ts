// Manual fixture-capture script. NOT part of the test suite.
// Hits the live Gemini API and overwrites the committed seed JSON in src/fixtures/
// with authentic extraction output.
//
// Run: GEMINI_API_KEY=... npm run capture-fixtures
//
// Invariant: this calls the SAME extractDocument production path (classify then
// extract), so captured fixtures are byte-identical in shape to what the server emits.
// It does no transform of its own.
import { readFile, writeFile } from 'node:fs/promises'
import { extractDocument } from '../src/extract/extract'

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('Set GEMINI_API_KEY to run the capture.')
  process.exit(1)
}

// Edit this manifest to match the sample images you place in src/assets/.
// `image` is read from src/assets/, `out` is written to src/fixtures/<out>.json.
// `form` records the expected form type (the classifier decides the actual one).
const SAMPLES: { image: string; mime: string; out: string; form: string }[] = [
  { image: 'w2-sample.png', mime: 'image/png', out: 'acme', form: 'W-2' },
  // Add a 1099-NEC sample here once you place one in src/assets/, for example:
  // { image: 'nec-sample.png', mime: 'image/png', out: 'nec', form: '1099-NEC' },
  // { image: 'int-sample.png', mime: 'image/png', out: 'int', form: '1099-INT' },
  // { image: 'div-sample.png', mime: 'image/png', out: 'div', form: '1099-DIV' },
]

for (const s of SAMPLES) {
  const bytes = await readFile(new URL(`../src/assets/${s.image}`, import.meta.url))
  const result = await extractDocument({ bytes, mimeType: s.mime }, apiKey)
  const outUrl = new URL(`../src/fixtures/${s.out}.json`, import.meta.url)
  await writeFile(outUrl, JSON.stringify(result, null, 2) + '\n')
  console.log(`captured ${s.image} -> src/fixtures/${s.out}.json (status: ${result.status})`)
}
