import type { BBox, Field } from '../../src/types'
import type { FieldGT, GroundTruth } from './types'
import { normalizeByType } from './normalize'

export type FieldScore = {
  key: string
  pass: boolean
  expected: string
  got: string
  confidence: number
  bboxOk: boolean
  bboxProblems: string[]
  note: string
}

export type VariantScore = {
  variant: string
  fields: FieldScore[]
  bboxOk: boolean
  bboxViolations: string[]
  meanConfidence: number
  passCount: number
  passRate: number
  status: string
  detectedFormType: string
  error?: string
}

const inRange = (n: number) => n >= 0 && n <= 100

export function bboxOk(b: BBox): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  if (b.page !== 1) problems.push(`page=${b.page} (expected 1)`)
  for (const [k, v] of [
    ['x', b.x],
    ['y', b.y],
    ['w', b.w],
    ['h', b.h],
  ] as const) {
    if (!inRange(v)) problems.push(`${k}=${v} out of 0..100`)
  }
  if (inRange(b.x) && inRange(b.w) && b.x + b.w > 100.01)
    problems.push(`x+w=${(b.x + b.w).toFixed(1)} off-page`)
  if (inRange(b.y) && inRange(b.h) && b.y + b.h > 100.01)
    problems.push(`y+h=${(b.y + b.h).toFixed(1)} off-page`)
  return { ok: problems.length === 0, problems }
}

export function scoreField(g: FieldGT, field: Field | undefined): FieldScore {
  const got = field?.value ?? ''
  const confidence = field?.confidence ?? 0
  // Only validate a bbox when the field is present with a non-empty value. A
  // correctly-empty field reports {0,0,0,0} by design, which is not a violation.
  const bb =
    field && field.value !== '' ? bboxOk(field.bbox) : { ok: true, problems: [] as string[] }

  let pass: boolean
  let note: string
  if (g.expectEmpty) {
    // Anti-hallucination: an empty answer is correct, a plausible value is a fail.
    const empty = normalizeByType(g.type, got) === ''
    pass = empty
    note = empty ? 'empty as required' : `HALLUCINATED "${got}" (should be empty)`
  } else {
    const want = normalizeByType(g.type, g.expected)
    const have = normalizeByType(g.type, got)
    pass = want === have
    note = pass ? 'match' : `want "${want}" got "${have}"`
  }

  return {
    key: g.key,
    pass,
    expected: g.expectEmpty ? '(empty)' : g.expected,
    got,
    confidence,
    bboxOk: bb.ok,
    bboxProblems: bb.problems,
    note,
  }
}

export function scoreVariant(
  variant: string,
  gt: GroundTruth,
  result: { fields: Field[]; status: string; detectedFormType: string; error?: string },
): VariantScore {
  const byKey = new Map(result.fields.map((f) => [f.key, f]))
  const fields = Object.values(gt.fields).map((g) => scoreField(g, byKey.get(g.key)))
  const bboxViolations = fields
    .filter((f) => !f.bboxOk)
    .map((f) => `${variant}/${f.key}: ${f.bboxProblems.join('; ')}`)
  const passCount = fields.filter((f) => f.pass).length
  const conf = fields.map((f) => f.confidence)
  const meanConfidence = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : 0

  return {
    variant,
    fields,
    bboxOk: bboxViolations.length === 0,
    bboxViolations,
    meanConfidence,
    passCount,
    passRate: fields.length ? passCount / fields.length : 0,
    status: result.status,
    detectedFormType: result.detectedFormType,
    error: result.error,
  }
}

export function renderResultsTable(rows: VariantScore[]): string {
  if (rows.length === 0) return '_no variants_\n'
  const keys = rows[0].fields.map((f) => f.key)
  const header = ['variant', ...keys, 'bbox', 'conf', 'pass%', 'status']
  const mark = (b: boolean) => (b ? 'PASS' : 'FAIL')
  const toRow = (cells: string[]) => `| ${cells.join(' | ')} |`
  const lines = rows.map((r) => {
    const byKey = new Map(r.fields.map((f) => [f.key, f]))
    const cells = keys.map((k) => mark(!!byKey.get(k)?.pass))
    return toRow([
      r.variant,
      ...cells,
      mark(r.bboxOk),
      r.meanConfidence.toFixed(2),
      `${Math.round(r.passRate * 100)}%`,
      r.error ? 'error' : r.status,
    ])
  })
  return [toRow(header), toRow(header.map(() => '---')), ...lines].join('\n') + '\n'
}
