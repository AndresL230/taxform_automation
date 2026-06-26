import { buildW2Document, w2CrossChecks, W2_FIELDS, type W2Extraction } from './w2'
import type { Field } from '../types'

const ex = (value: string, confidence: number) => ({
  value,
  confidence,
  bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
})

const okFields = (): W2Extraction['fields'] => ({
  wages: ex('58500.00', 0.97),
  federalWithholding: ex('7920.00', 0.96),
  socialSecurityWages: ex('60000.00', 0.95),
  socialSecurityTaxWithheld: ex('3720.00', 0.95),
  medicareWages: ex('60000.00', 0.95),
  medicareTaxWithheld: ex('870.00', 0.95),
  employerEIN: ex('94-2719303', 0.93),
  employeeSSN: ex('532-19-7766', 0.94),
  employeeName: ex('Jordan A. Reyes', 0.9),
  employerName: ex('Northwind Logistics LLC', 0.91),
})

const extraction = (isLegibleW2: boolean, fields: W2Extraction['fields']): W2Extraction => ({
  detectedFormType: 'W-2',
  isLegibleW2,
  fields,
})

test('maps W2_FIELDS into Field[] in the frozen shape with originalValue === value', () => {
  const { fields, status } = buildW2Document(extraction(true, okFields()))
  expect(status).toBe('ready')
  expect(fields).toHaveLength(10)
  const wages = fields.find((f) => f.key === 'wages') as Field
  expect(wages).toEqual({
    key: 'wages',
    label: 'Wages, tips, other comp.',
    box: '1',
    value: '58500.00',
    originalValue: '58500.00',
    confidence: 0.97,
    type: 'currency',
    bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
  })
  for (const f of fields) {
    expect(f.originalValue).toBe(f.value)
    expect(Object.keys(f).sort()).toEqual(
      ['bbox', 'box', 'confidence', 'key', 'label', 'originalValue', 'type', 'value'].sort(),
    )
  }
  expect(fields.map((f) => f.key)).toEqual(W2_FIELDS.map((f) => f.key))
})

test('status is needs_review when any field confidence < 0.7', () => {
  const f = okFields()
  f.socialSecurityWages = ex('60000.00', 0.5)
  expect(buildW2Document(extraction(true, f)).status).toBe('needs_review')
})

test('status is needs_review when any field value is empty', () => {
  const f = okFields()
  f.employeeName = ex('', 0.95)
  expect(buildW2Document(extraction(true, f)).status).toBe('needs_review')
})

test('status is failed when not a legible W-2, but fields are still mapped', () => {
  const { fields, status } = buildW2Document(extraction(false, okFields()))
  expect(status).toBe('failed')
  expect(fields).toHaveLength(10)
})

test('w2CrossChecks returns no messages for arithmetic-consistent fields', () => {
  const { fields } = buildW2Document(extraction(true, okFields()))
  expect(w2CrossChecks(fields)).toEqual([])
})

test('w2CrossChecks flags social security tax that is off by more than the tolerance', () => {
  const f = okFields()
  f.socialSecurityTaxWithheld = ex('3000.00', 0.95) // expected 3720.00
  const { fields } = buildW2Document(extraction(true, f))
  const msgs = w2CrossChecks(fields)
  expect(msgs).toHaveLength(1)
  expect(msgs[0].fieldKey).toBe('socialSecurityTaxWithheld')
})

test('w2CrossChecks skips an identity when an operand is empty', () => {
  const f = okFields()
  f.socialSecurityWages = ex('', 0.95)
  const { fields } = buildW2Document(extraction(true, f))
  expect(w2CrossChecks(fields).some((m) => m.fieldKey === 'socialSecurityTaxWithheld')).toBe(false)
})

test('status is needs_review when a cross-check fails even at high confidence', () => {
  const f = okFields()
  f.medicareTaxWithheld = ex('5000.00', 0.99) // expected 870.00, high confidence
  expect(buildW2Document(extraction(true, f)).status).toBe('needs_review')
})
