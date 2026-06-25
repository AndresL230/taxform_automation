// Fills the IRS fillable W-2, flattens it, renders page 1 to PNG, and writes
// per-scenario ground truth. Run standalone for debugging:
//   DUMP_FIELDS=1 npx vite-node scripts/eval/make-w2.ts   (list AcroForm fields)
//   npx vite-node scripts/eval/make-w2.ts                 (render all scenarios)
// This script does NOT call the model. It only produces images and ground truth.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { PDFDocument, PDFTextField } from 'pdf-lib'
import { pdf } from 'pdf-to-img'
import { makeScenario, SCORED_KEYS, type Scenario } from './groundtruth'
import type { FormData, Layout, VariantManifestEntry } from './types'

const ASSET = new URL('./assets/fw2.pdf', import.meta.url)
const OUT = new URL('./out/', import.meta.url)
const SCALE = 3 // pdf-to-img viewport scale: rendered pixels = PDF points * SCALE

const SEEDS: Record<Scenario, number> = {
  clean: 1,
  zero_withholding: 2,
  masked_ssn: 3,
  large_values: 4,
}

// Logical field key -> AcroForm text-field name on the page-1 copy of fw2.pdf.
// Validated at runtime; reconcile via DUMP_FIELDS=1 if the placed PDF differs.
const FIELD_MAP: Record<keyof FormData, string> = {
  employeeSSN: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_01[0]',
  employerEIN: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_02[0]',
  employerName: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_03[0]',
  employerAddress: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_04[0]',
  controlNumber: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_05[0]',
  employeeName: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_06[0]',
  employeeAddress: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_09[0]',
  wages: 'topmostSubform[0].Copy1[0].RightCol[0].f2_10[0]',
  federalWithholding: 'topmostSubform[0].Copy1[0].RightCol[0].f2_11[0]',
  socialSecurityWages: 'topmostSubform[0].Copy1[0].RightCol[0].f2_12[0]',
  socialSecurityTaxWithheld: 'topmostSubform[0].Copy1[0].RightCol[0].f2_13[0]',
  medicareWages: 'topmostSubform[0].Copy1[0].RightCol[0].f2_14[0]',
  medicareTaxWithheld: 'topmostSubform[0].Copy1[0].RightCol[0].f2_15[0]',
  stateCode: 'topmostSubform[0].Copy1[0].RightCol[0].f2_24[0]',
  stateWages: 'topmostSubform[0].Copy1[0].RightCol[0].f2_26[0]',
  stateTax: 'topmostSubform[0].Copy1[0].RightCol[0].f2_27[0]',
}

async function renderPng(pdfBytes: Uint8Array): Promise<Buffer> {
  const doc = await pdf(Buffer.from(pdfBytes), { scale: SCALE })
  for await (const page of doc) return page as Buffer
  throw new Error('pdf-to-img produced no pages')
}

async function fillScenario(
  scenario: Scenario,
  basePdf: Buffer,
): Promise<VariantManifestEntry> {
  const { formData, groundTruth } = makeScenario(scenario, SEEDS[scenario])
  const doc = await PDFDocument.load(basePdf)
  const form = doc.getForm()
  const present = new Set(form.getFields().map((f) => f.getName()))

  // Validate the map. Any non-blank field whose name is missing stops the run.
  const missing = (Object.keys(FIELD_MAP) as (keyof FormData)[])
    .filter((k) => formData[k] !== '' && !present.has(FIELD_MAP[k]))
    .map((k) => `${k} -> "${FIELD_MAP[k]}"`)
  if (missing.length) {
    console.error('FIELD_MAP names not found in fw2.pdf:\n  ' + missing.join('\n  '))
    console.error('\nAvailable field names:\n  ' + [...present].join('\n  '))
    throw new Error('Reconcile FIELD_MAP against the placed PDF (see README).')
  }

  // Capture pixel rects for the scored fields BEFORE flattening (clean only).
  let layout: Layout = {}
  if (scenario === 'clean') {
    const page = doc.getPage(0)
    const pageH = page.getHeight()
    for (const key of SCORED_KEYS) {
      const field = form.getField(FIELD_MAP[key])
      if (!(field instanceof PDFTextField)) continue
      const widget = field.acroField.getWidgets()[0]
      const r = widget.getRectangle() // PDF points, y measured from the bottom
      layout[key] = {
        x: r.x * SCALE,
        y: (pageH - r.y - r.height) * SCALE,
        w: r.width * SCALE,
        h: r.height * SCALE,
      }
    }
  }

  // Fill non-blank fields.
  for (const key of Object.keys(FIELD_MAP) as (keyof FormData)[]) {
    const value = formData[key]
    if (!value) continue
    form.getTextField(FIELD_MAP[key]).setText(value)
  }

  form.flatten() // bake values into the page content so the raster shows them
  const filled = await doc.save()
  const png = await renderPng(filled)

  await writeFile(new URL(`${scenario}.png`, OUT), png)
  await writeFile(
    new URL(`${scenario}.groundtruth.json`, OUT),
    JSON.stringify(groundTruth, null, 2),
  )
  if (scenario === 'clean') {
    await writeFile(new URL('clean.layout.json', OUT), JSON.stringify(layout, null, 2))
    await writeFile(new URL('clean.formdata.json', OUT), JSON.stringify(formData, null, 2))
  }
  return {
    variant: scenario,
    image: `${scenario}.png`,
    mime: 'image/png',
    groundtruth: `${scenario}.groundtruth.json`,
  }
}

export async function generateRenderVariants(): Promise<VariantManifestEntry[]> {
  let basePdf: Buffer
  try {
    basePdf = await readFile(ASSET)
  } catch {
    throw new Error(
      'scripts/eval/assets/fw2.pdf is missing. Download irs.gov/pub/irs-pdf/fw2.pdf there (see README).',
    )
  }
  await mkdir(OUT, { recursive: true })

  if (process.env.DUMP_FIELDS) {
    const form = (await PDFDocument.load(basePdf)).getForm()
    console.log('AcroForm fields in fw2.pdf:')
    for (const f of form.getFields()) console.log(`  ${f.constructor.name}  ${f.getName()}`)
    return []
  }

  const scenarios: Scenario[] = ['clean', 'zero_withholding', 'masked_ssn', 'large_values']
  const entries: VariantManifestEntry[] = []
  for (const s of scenarios) entries.push(await fillScenario(s, basePdf))
  return entries
}

// Standalone debug entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = await generateRenderVariants()
  for (const e of entries) console.log(`rendered ${e.variant} -> out/${e.image}`)
}
