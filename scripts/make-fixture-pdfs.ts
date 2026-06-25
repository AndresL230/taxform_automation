// Generates a distinct demo PDF per fixture so each seeded document renders its own
// page in the review viewer. Each scored field's value is placed at its stored bbox
// (percent of page), so the click-to-highlight overlay lines up with the printed value.
// Run: npx vite-node scripts/make-fixture-pdfs.ts   (or: npm run make-fixture-pdfs)
// The output PDFs are committed; rerun only when a fixture's fields or bboxes change.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

type FieldJson = {
  key: string
  label: string
  box: string
  value: string
  bbox: { page: number; x: number; y: number; w: number; h: number }
}
type ResultJson = { status: string; detectedFormType: string; fields: FieldJson[] }

const FIXTURES = ['acme', 'jdoe', 'scan', 'contoso', 'smallco', 'nec', 'int', 'div']
const SRC = new URL('../src/fixtures/', import.meta.url)
const OUT = new URL('../src/assets/fixtures/', import.meta.url)

const W = 612 // US Letter width in points
const H = 792 // US Letter height in points

async function makePdf(name: string): Promise<void> {
  const data = JSON.parse(await readFile(new URL(`${name}.json`, SRC), 'utf8')) as ResultJson
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([W, H])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.1, 0.1, 0.12)
  const muted = rgb(0.5, 0.5, 0.55)
  const line = rgb(0.82, 0.82, 0.85)

  page.drawText(`Form ${data.detectedFormType}`, { x: 40, y: H - 52, size: 18, font: bold, color: ink })
  page.drawText(`${name}, demo document`, { x: 40, y: H - 70, size: 9, font, color: muted })
  page.drawLine({ start: { x: 40, y: H - 80 }, end: { x: W - 40, y: H - 80 }, thickness: 1, color: line })

  for (const f of data.fields) {
    const x = Math.max((f.bbox.x / 100) * W, 40)
    const boxW = Math.max((f.bbox.w / 100) * W, 70)
    const boxH = Math.max((f.bbox.h / 100) * H, 14)
    const yTop = (f.bbox.y / 100) * H
    const yBottom = H - yTop - boxH // pdf-lib y origin is the bottom of the page

    const label = f.box ? `${f.label} (Box ${f.box})` : f.label
    page.drawText(label, { x: 42, y: yBottom + boxH + 1, size: 6.5, font, color: muted })
    page.drawRectangle({ x: x - 2, y: yBottom, width: boxW, height: boxH, borderColor: line, borderWidth: 0.5 })
    page.drawText(f.value, { x, y: yBottom + 3, size: 10, font: bold, color: ink })
  }

  if (data.fields.length === 0) {
    page.drawText('Unsupported document, no fields extracted.', { x: 40, y: H - 120, size: 11, font, color: rgb(0.55, 0.2, 0.2) })
  }

  const bytes = await pdf.save()
  await writeFile(new URL(`${name}.pdf`, OUT), bytes)
  console.log(`wrote src/assets/fixtures/${name}.pdf (${data.detectedFormType}, ${data.fields.length} fields)`)
}

await mkdir(OUT, { recursive: true })
for (const n of FIXTURES) await makePdf(n)
