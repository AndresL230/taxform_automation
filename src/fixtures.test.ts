import { fixtures } from './fixtures'

test('there are 6 documents covering ready, needs_review, and failed', () => {
  expect(fixtures).toHaveLength(6)
  const statuses = fixtures.map((d) => d.status)
  expect(statuses).toContain('ready')
  expect(statuses).toContain('needs_review')
  expect(statuses).toContain('failed')
  expect(statuses).not.toContain('processing')
})

test('ready docs have their form field count, confident and non-empty, unedited', () => {
  const counts: Record<string, number> = { 'W-2': 7, '1099-NEC': 6 }
  for (const d of fixtures.filter((d) => d.status === 'ready')) {
    expect(d.fields).toHaveLength(counts[d.formType])
    expect(d.fields.every((f) => f.value !== '' && f.confidence >= 0.7)).toBe(true)
    expect(d.fields.every((f) => f.value === f.originalValue)).toBe(true)
  }
})

test('a needs_review doc has 7 fields with at least one below 0.7 confidence', () => {
  const nr = fixtures.find((d) => d.status === 'needs_review')!
  expect(nr.fields).toHaveLength(7)
  expect(nr.fields.some((f) => f.confidence < 0.7)).toBe(true)
})

test('the failed doc has no fields and the server unsupported-form message', () => {
  const failed = fixtures.find((d) => d.status === 'failed')!
  expect(failed.fields).toHaveLength(0)
  expect(failed.error).toBe('Detected 1098, not a supported form.')
})

test('fields use the production W2_FIELDS keys in order', () => {
  const nr = fixtures.find((d) => d.status === 'needs_review')!
  expect(nr.fields.map((f) => f.key)).toEqual([
    'wages', 'federalWithholding', 'socialSecurityWages', 'employerEIN', 'employeeSSN', 'employeeName', 'employerName',
  ])
})

test('every field bbox is within 0 to 100', () => {
  for (const d of fixtures) {
    for (const f of d.fields) {
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(f.bbox[k]).toBeGreaterThanOrEqual(0)
        expect(f.bbox[k]).toBeLessThanOrEqual(100)
      }
    }
  }
})
