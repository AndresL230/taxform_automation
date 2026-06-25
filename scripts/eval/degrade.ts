// Derives image, layout, and content-image variants from the clean render.
// Run standalone (after make-w2.ts) with: npx vite-node scripts/eval/degrade.ts
// This script does NOT call the model.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import type {
  FormData,
  GroundTruth,
  Layout,
  LayoutRect,
  VariantManifestEntry,
} from './types'

const OUT = new URL('./out/', import.meta.url)

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(name, OUT), 'utf8')) as T
}

type Point = { x: number; y: number }

// Bilinear interpolation of a quad's four corners [TL, TR, BR, BL] at (u, v).
function bilerp(q: Point[], u: number, v: number): Point {
  const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u }
  const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u }
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v }
}

// Draw the source triangle s onto the destination triangle d via an affine map.
function drawTri(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  img: Awaited<ReturnType<typeof loadImage>>,
  s: Point[],
  d: Point[],
): void {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(d[0].x, d[0].y)
  ctx.lineTo(d[1].x, d[1].y)
  ctx.lineTo(d[2].x, d[2].y)
  ctx.closePath()
  ctx.clip()
  const denom = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y)
  const a = ((d[1].x - d[0].x) * (s[2].y - s[0].y) - (d[2].x - d[0].x) * (s[1].y - s[0].y)) / denom
  const b = ((d[1].y - d[0].y) * (s[2].y - s[0].y) - (d[2].y - d[0].y) * (s[1].y - s[0].y)) / denom
  const c = ((d[2].x - d[0].x) * (s[1].x - s[0].x) - (d[1].x - d[0].x) * (s[2].x - s[0].x)) / denom
  const e = ((d[2].y - d[0].y) * (s[1].x - s[0].x) - (d[1].y - d[0].y) * (s[2].x - s[0].x)) / denom
  const tx = d[0].x - a * s[0].x - c * s[0].y
  const ty = d[0].y - b * s[0].x - e * s[0].y
  ctx.setTransform(a, b, c, e, tx, ty)
  ctx.drawImage(img, 0, 0)
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

async function perspective(base: Buffer, W: number, H: number): Promise<Buffer> {
  const img = await loadImage(base)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  const src: Point[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ]
  // Tilt: top edge pushed inward and down on the left, simulating a phone photo.
  const dst: Point[] = [
    { x: W * 0.1, y: H * 0.05 },
    { x: W * 0.93, y: 0 },
    { x: W, y: H },
    { x: 0, y: H * 0.95 },
  ]
  const N = 24
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u0 = i / N
      const u1 = (i + 1) / N
      const v0 = j / N
      const v1 = (j + 1) / N
      const s00 = bilerp(src, u0, v0)
      const s10 = bilerp(src, u1, v0)
      const s11 = bilerp(src, u1, v1)
      const s01 = bilerp(src, u0, v1)
      const d00 = bilerp(dst, u0, v0)
      const d10 = bilerp(dst, u1, v0)
      const d11 = bilerp(dst, u1, v1)
      const d01 = bilerp(dst, u0, v1)
      drawTri(ctx, img, [s00, s10, s11], [d00, d10, d11])
      drawTri(ctx, img, [s00, s11, s01], [d00, d11, d01])
    }
  }
  return canvas.toBuffer('image/png')
}

async function fourUp(base: Buffer, W: number): Promise<Buffer> {
  const half = await sharp(base).resize({ width: Math.round(W / 2) }).png().toBuffer()
  const m = await sharp(half).metadata()
  const hw = m.width ?? Math.round(W / 2)
  const hh = m.height ?? 0
  return sharp({ create: { width: hw * 2, height: hh * 2, channels: 3, background: '#ffffff' } })
    .composite([
      { input: half, left: 0, top: 0 },
      { input: half, left: hw, top: 0 },
      { input: half, left: 0, top: hh },
      { input: half, left: hw, top: hh },
    ])
    .png()
    .toBuffer()
}

async function redact(base: Buffer, rect: LayoutRect): Promise<Buffer> {
  const img = await loadImage(base)
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(rect.x - 6, rect.y - 6, rect.w + 12, rect.h + 12)
  return canvas.toBuffer('image/png')
}

// Re-render the same data in a plain payroll/ADP-style layout (not the IRS red
// form). Amounts carry a dollar sign here to also exercise the $-stripping rule.
async function adpStyle(fd: FormData): Promise<Buffer> {
  const W = 1700
  const H = 2200
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#111111'
  ctx.font = 'bold 46px sans-serif'
  ctx.fillText('Form W-2 Wage and Tax Statement', 80, 120)
  ctx.font = '28px sans-serif'
  ctx.fillText('2025  Payroll provider copy', 80, 168)

  const cell = (label: string, value: string, x: number, y: number) => {
    ctx.strokeStyle = '#cccccc'
    ctx.strokeRect(x - 16, y - 30, 700, 92)
    ctx.fillStyle = '#666666'
    ctx.font = '22px sans-serif'
    ctx.fillText(label, x, y)
    ctx.fillStyle = '#111111'
    ctx.font = '32px sans-serif'
    ctx.fillText(value, x, y + 42)
  }
  const dollars = (v: string) => (v ? `$${v}` : '')

  cell('c Employer name', fd.employerName, 80, 280)
  cell('b Employer EIN', fd.employerEIN, 840, 280)
  cell('e Employee name', fd.employeeName, 80, 420)
  cell('a Employee SSN', fd.employeeSSN, 840, 420)
  cell('1 Wages, tips, other comp.', dollars(fd.wages), 80, 560)
  cell('2 Federal income tax withheld', dollars(fd.federalWithholding), 840, 560)
  cell('3 Social security wages', dollars(fd.socialSecurityWages), 80, 700)
  cell('Employee address', fd.employeeAddress, 80, 840)
  return canvas.toBuffer('image/png')
}

export async function generateDegradedVariants(): Promise<VariantManifestEntry[]> {
  const base = await readFile(new URL('clean.png', OUT))
  const cleanGt = await readJson<GroundTruth>('clean.groundtruth.json')
  const layout = await readJson<Layout>('clean.layout.json')
  const formData = await readJson<FormData>('clean.formdata.json')
  const meta = await sharp(base).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0

  const entries: VariantManifestEntry[] = []
  const emit = async (
    name: string,
    buf: Buffer,
    mime: 'image/png' | 'image/jpeg',
    gt: GroundTruth = cleanGt,
  ) => {
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png'
    const image = `${name}.${ext}`
    const gtName = `${name}.groundtruth.json`
    await writeFile(new URL(image, OUT), buf)
    await writeFile(new URL(gtName, OUT), JSON.stringify(gt, null, 2))
    entries.push({ variant: name, image, mime, groundtruth: gtName })
  }

  // Image quality, one axis each.
  await emit('low_res', await sharp(base).resize({ width: 720 }).png().toBuffer(), 'image/png')
  await emit('jpeg_artifacts', await sharp(base).jpeg({ quality: 35 }).toBuffer(), 'image/jpeg')
  await emit('skew_3deg', await sharp(base).rotate(3, { background: '#ffffff' }).png().toBuffer(), 'image/png')
  await emit('skew_7deg', await sharp(base).rotate(7, { background: '#ffffff' }).png().toBuffer(), 'image/png')
  await emit('blur', await sharp(base).blur(3).png().toBuffer(), 'image/png')
  await emit('underexposed', await sharp(base).modulate({ brightness: 0.5 }).png().toBuffer(), 'image/png')
  await emit('overexposed', await sharp(base).modulate({ brightness: 1.7 }).png().toBuffer(), 'image/png')
  await emit('perspective_warp', await perspective(base, W, H), 'image/png')

  // Layout and rendering.
  await emit('four_up', await fourUp(base, W), 'image/png')
  await emit('bw_scan', await sharp(base).grayscale().linear(1.25, -30).blur(0.6).png().toBuffer(), 'image/png')
  await emit('substitute_style', await adpStyle(formData), 'image/png')

  // Content edge case handled on the image side: redact one field, expect empty.
  const illegibleGt: GroundTruth = {
    scenario: 'illegible_field',
    fields: {
      ...cleanGt.fields,
      wages: { ...cleanGt.fields.wages, printed: '', expected: '', expectEmpty: true },
    },
  }
  await emit('illegible_field', await redact(base, layout.wages), 'image/png', illegibleGt)

  return entries
}

// Standalone debug entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = await generateDegradedVariants()
  for (const e of entries) console.log(`degraded ${e.variant} -> out/${e.image}`)
}
