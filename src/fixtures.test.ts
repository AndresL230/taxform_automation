import { fixtures, W2_FIELD_TEMPLATE } from './fixtures'

test('there are 5 documents covering every status', () => {
  expect(fixtures).toHaveLength(5)
  const statuses = fixtures.map((d) => d.status).sort()
  expect(statuses).toContain('ready')
  expect(statuses).toContain('needs_review')
  expect(statuses).toContain('failed')
  expect(statuses).toContain('processing')
})

test('the needs_review doc has exactly 2 low-confidence fields (<0.7)', () => {
  const nr = fixtures.find((d) => d.status === 'needs_review')!
  expect(nr.fields).toHaveLength(7)
  expect(nr.fields.filter((f) => f.confidence < 0.7)).toHaveLength(2)
  expect(nr.fields.some((f) => f.value !== f.originalValue)).toBe(true)
})

test('failed and processing docs have no fields; one ready doc is partial', () => {
  expect(fixtures.find((d) => d.status === 'failed')!.fields).toHaveLength(0)
  expect(fixtures.find((d) => d.status === 'processing')!.fields).toHaveLength(0)
  const readies = fixtures.filter((d) => d.status === 'ready')
  expect(readies.some((d) => d.fields.length === 5)).toBe(true)
})

test('every field has a bbox in 0–100% range', () => {
  for (const d of fixtures) {
    for (const f of d.fields) {
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(f.bbox[k]).toBeGreaterThanOrEqual(0)
        expect(f.bbox[k]).toBeLessThanOrEqual(100)
      }
    }
  }
})

test('the field template has all 7 W-2 fields', () => {
  expect(W2_FIELD_TEMPLATE.map((f) => f.key)).toEqual([
    'wages', 'fedWithholding', 'ssWages', 'employerEIN', 'employeeSSN',
    'employeeName', 'employerName',
  ])
})
