// Fills a form's fillable IRS PDF, flattens it, renders page 1 to PNG, and writes
// per-scenario ground truth. Driven by an EvalForm (see forms.ts). Run standalone:
//   FORM=1099-NEC DUMP_FIELDS=1 npx vite-node scripts/eval/make-form.ts  (list AcroForm fields)
//   FORM=1099-NEC npx vite-node scripts/eval/make-form.ts                (render all scenarios)
//   npx vite-node scripts/eval/make-form.ts                              (W-2, the default)
// This script does NOT call the model. It only produces images and ground truth.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { PDFDocument, PDFTextField } from 'pdf-lib'
import { pdf } from 'pdf-to-img'
import { getEvalForm, type EvalForm } from './forms'
import type { Layout, VariantManifestEntry } from './types'

const OUT = new URL('./out/', import.meta.url)
const SCALE = 3 // pdf-to-img viewport scale: rendered pixels = PDF points * SCALE

async function renderPng(pdfBytes: Uint8Array): Promise<Buffer> {
  const doc = await pdf(Buffer.from(pdfBytes), { scale: SCALE })
  for await (const page of doc) return page as Buffer
  throw new Error('pdf-to-img produced no pages')
}

async function fillScenario(form: EvalForm, scenario: string, basePdf: Buffer): Promise<VariantManifestEntry> {
  const { formData, groundTruth } = form.make(scenario, form.seeds[scenario])
  const doc = await PDFDocument.load(basePdf)
  const pdfForm = doc.getForm()
  const present = new Set(pdfForm.getFields().map((f) => f.getName()))

  // Validate the map. Any non-blank field whose name is missing stops the run.
  const missing = Object.keys(form.fieldMap)
    .filter((k) => formData[k] !== undefined && formData[k] !== '' && !present.has(form.fieldMap[k]))
    .map((k) => `${k} -> "${form.fieldMap[k]}"`)
  if (missing.length) {
    console.error(`fieldMap names not found in ${form.asset}:\n  ` + missing.join('\n  '))
    console.error('\nAvailable field names:\n  ' + [...present].join('\n  '))
    throw new Error('Reconcile fieldMap against the placed PDF (see README).')
  }

  // Capture pixel rects for the scored fields BEFORE flattening (clean only).
  let layout: Layout = {}
  if (scenario === 'clean') {
    const page = doc.getPage(0)
    const pageH = page.getHeight()
    for (const key of form.scoredKeys) {
      const name = form.fieldMap[key]
      if (!name) continue
      const field = pdfForm.getField(name)
      if (!(field instanceof PDFTextField)) continue
      const r = field.acroField.getWidgets()[0].getRectangle() // PDF points, y from the bottom
      layout[key] = { x: r.x * SCALE, y: (pageH - r.y - r.height) * SCALE, w: r.width * SCALE, h: r.height * SCALE }
    }
  }

  // Fill non-blank fields.
  for (const key of Object.keys(form.fieldMap)) {
    const value = formData[key]
    if (!value) continue
    pdfForm.getTextField(form.fieldMap[key]).setText(value)
  }

  pdfForm.flatten() // bake values into the page content so the raster shows them
  const filled = await doc.save()
  const png = await renderPng(filled)

  await writeFile(new URL(`${scenario}.png`, OUT), png)
  await writeFile(new URL(`${scenario}.groundtruth.json`, OUT), JSON.stringify(groundTruth, null, 2))
  if (scenario === 'clean') {
    await writeFile(new URL('clean.layout.json', OUT), JSON.stringify(layout, null, 2))
    await writeFile(new URL('clean.formdata.json', OUT), JSON.stringify(formData, null, 2))
  }
  return { variant: scenario, image: `${scenario}.png`, mime: 'image/png', groundtruth: `${scenario}.groundtruth.json` }
}

export async function generateRenderVariants(form: EvalForm): Promise<VariantManifestEntry[]> {
  let basePdf: Buffer
  try {
    basePdf = await readFile(new URL(`./assets/${form.asset}`, import.meta.url))
  } catch {
    throw new Error(`scripts/eval/assets/${form.asset} is missing (see README).`)
  }
  await mkdir(OUT, { recursive: true })

  if (process.env.DUMP_FIELDS) {
    const pdfForm = (await PDFDocument.load(basePdf)).getForm()
    console.log(`AcroForm fields in ${form.asset}:`)
    for (const f of pdfForm.getFields()) console.log(`  ${f.constructor.name}  ${f.getName()}`)
    return []
  }

  const entries: VariantManifestEntry[] = []
  for (const s of form.scenarios) entries.push(await fillScenario(form, s, basePdf))
  return entries
}

// Standalone debug entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  const form = getEvalForm(process.env.FORM ?? 'W-2')
  const entries = await generateRenderVariants(form)
  for (const e of entries) console.log(`rendered ${e.variant} -> out/${e.image}`)
}
