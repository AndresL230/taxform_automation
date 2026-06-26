// Generates a realistic demo PDF per fixture by filling the official IRS form (Copy 1,
// the clean black copy on page index 2) with the fixture's values, cropping the page to
// the form area, and rewriting each fixture's field bboxes to the real field positions
// so the click-to-highlight overlay lines up with the printed values.
//
// Requires the official IRS templates under scripts/eval/assets/ (gitignored, same as the
// eval harness): fw2.pdf, f1099nec.pdf, f1099int.pdf, f1099div.pdf. Download with:
//   for f in fw2 f1099nec f1099int f1099div; do curl -sL -o scripts/eval/assets/$f.pdf \
//     https://www.irs.gov/pub/irs-pdf/$f.pdf; done
// Run: npm run make-fixture-pdfs   (output PDFs and updated fixture JSON are committed)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { PDFDocument, PDFTextField, rgb, StandardFonts } from 'pdf-lib'

type FieldJson = { key: string; bbox: { page: number; x: number; y: number; w: number; h: number } } & Record<string, unknown>
type ResultJson = { status: string; detectedFormType: string; fields: FieldJson[] }

// Per form: template asset, the copy prefix and its page index, and fixture-key -> f-id
// within that copy (ids reconciled against the current IRS PDFs via their AcroForm dump).
type FormCfg = { asset: string; copy: string; page: number; map: Record<string, string> }
const FORMS: Record<string, FormCfg> = {
  'W-2': {
    asset: 'fw2.pdf', copy: 'Copy1', page: 2,
    map: { employeeSSN: 'f2_01', employerEIN: 'f2_02', employerName: 'f2_03', employeeName: 'f2_05', wages: 'f2_09', federalWithholding: 'f2_10', socialSecurityWages: 'f2_11' },
  },
  '1099-NEC': {
    asset: 'f1099nec.pdf', copy: 'Copy1', page: 2,
    map: { payerName: 'f2_2', payerTIN: 'f2_10', recipientTIN: 'f2_11', recipientName: 'f2_12', nonemployeeCompensation: 'f2_20', federalWithholding: 'f2_26' },
  },
  '1099-INT': {
    asset: 'f1099int.pdf', copy: 'Copy1', page: 2,
    map: { payerName: 'f2_1', payerTIN: 'f2_2', recipientTIN: 'f2_3', recipientName: 'f2_4', interestIncome: 'f2_9', earlyWithdrawalPenalty: 'f2_10', interestUSSavingsBonds: 'f2_11', federalWithholding: 'f2_12' },
  },
  '1099-DIV': {
    asset: 'f1099div.pdf', copy: 'Copy1', page: 2,
    map: { payerName: 'f2_2', payerTIN: 'f2_3', recipientTIN: 'f2_4', recipientName: 'f2_5', ordinaryDividends: 'f2_9', qualifiedDividends: 'f2_10', totalCapitalGain: 'f2_11', federalWithholding: 'f2_18' },
  },
}

// fixture name -> source json
const FIXTURES = ['acme', 'jdoe', 'scan', 'contoso', 'smallco', 'nec', 'int', 'div']
const SRC = new URL('../src/fixtures/', import.meta.url)
const TPL = new URL('../scripts/eval/assets/', import.meta.url)
const OUT = new URL('../src/assets/fixtures/', import.meta.url)

type Rect = { x: number; y: number; w: number; h: number }

function rectOf(field: PDFTextField): Rect | null {
  const w = field.acroField.getWidgets()[0]
  if (!w) return null
  const r = w.getRectangle()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

function copyFieldId(name: string, copy: string): string | null {
  if (!name.includes(`.${copy}[0].`)) return null
  const m = name.match(/\.(f\d+_\d+)\[0\]$/)
  return m ? m[1] : null
}

async function fillForm(name: string, data: ResultJson, cfg: FormCfg): Promise<void> {
  const tpl = await PDFDocument.load(await readFile(new URL(cfg.asset, TPL)))
  const form = tpl.getForm()

  // Index the chosen copy's text fields by their f-id, and collect rects for the crop.
  const byId = new Map<string, PDFTextField>()
  const rects: Rect[] = []
  for (const f of form.getFields()) {
    if (!(f instanceof PDFTextField)) continue
    const id = copyFieldId(f.getName(), cfg.copy)
    if (!id) continue
    byId.set(id, f)
    const r = rectOf(f)
    if (r) rects.push(r)
  }

  // Fill mapped fields and remember each one's rectangle for bbox realignment.
  const valueRect: Record<string, Rect> = {}
  const valueByKey = new Map(data.fields.map((f) => [f.key, String((f as { value?: unknown }).value ?? '')]))
  for (const [key, id] of Object.entries(cfg.map)) {
    const field = byId.get(id)
    const value = valueByKey.get(key)
    if (!field || value === undefined) continue
    field.setFontSize(9)
    field.setText(value)
    const r = rectOf(field)
    if (r) valueRect[key] = r
  }

  // Crop page to the form area (full width, vertical extent of the copy's fields).
  const page = tpl.getPage(cfg.page)
  const pageW = page.getWidth()
  const top = Math.min(792, Math.max(...rects.map((r) => r.y + r.h)) + 28)
  const bottom = Math.max(0, Math.min(...rects.map((r) => r.y)) - 28)
  const cropH = top - bottom

  form.flatten()

  const out = await PDFDocument.create()
  const [copied] = await out.copyPages(tpl, [cfg.page])
  copied.setCropBox(0, bottom, pageW, cropH)
  out.addPage(copied)
  await writeFile(new URL(`${name}.pdf`, OUT), await out.save())

  // Rewrite fixture bboxes to the real field positions within the crop (percent).
  for (const f of data.fields) {
    const r = valueRect[f.key]
    if (!r) continue
    f.bbox = {
      page: 1,
      x: round((r.x / pageW) * 100),
      y: round(((top - (r.y + r.h)) / cropH) * 100),
      w: round((r.w / pageW) * 100),
      h: round((r.h / cropH) * 100),
    }
  }
  await writeFile(new URL(`${name}.json`, SRC), JSON.stringify(data, null, 2) + '\n')
  console.log(`wrote ${name}.pdf (${data.detectedFormType}, ${Object.keys(valueRect).length} fields placed) and realigned bboxes`)
}

// Fallback for a fixture whose form we do not template (the failed 1098, never shown in
// the viewer): a plain single page so the import resolves.
async function fillPlaceholder(name: string, data: ResultJson): Promise<void> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 400])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText(`Form ${data.detectedFormType}`, { x: 40, y: 350, size: 16, font, color: rgb(0.1, 0.1, 0.12) })
  page.drawText('Unsupported document, not extracted.', { x: 40, y: 326, size: 10, font, color: rgb(0.5, 0.2, 0.2) })
  await writeFile(new URL(`${name}.pdf`, OUT), await pdf.save())
  console.log(`wrote ${name}.pdf (${data.detectedFormType}, placeholder)`)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

await mkdir(OUT, { recursive: true })
for (const name of FIXTURES) {
  const data = JSON.parse(await readFile(new URL(`${name}.json`, SRC), 'utf8')) as ResultJson
  const cfg = FORMS[data.detectedFormType]
  if (cfg) await fillForm(name, data, cfg)
  else await fillPlaceholder(name, data)
}
