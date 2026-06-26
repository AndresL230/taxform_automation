import { buildDocument, type ParsedExtraction } from './build'
import { NEC_FORM } from './nec'
import type { Field } from '../types'

const ex = (value: string, confidence: number) => ({ value, confidence, bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 } })
const necFields = (): ParsedExtraction['fields'] => ({
  nonemployeeCompensation: ex('24500.00', 0.97),
  federalWithholding: ex('0.00', 0.96),
  payerTIN: ex('12-3456789', 0.95),
  recipientTIN: ex('123-45-6789', 0.94),
  payerName: ex('Globex Corporation', 0.93),
  recipientName: ex('Dana Lee', 0.92),
})

test('buildDocument maps NEC_FIELDS into 6 Fields in the frozen shape', () => {
  const { fields, status } = buildDocument({ isLegible: true, fields: necFields() }, NEC_FORM)
  expect(status).toBe('ready')
  expect(fields).toHaveLength(6)
  const comp = fields.find((f) => f.key === 'nonemployeeCompensation') as Field
  expect(comp).toEqual({
    key: 'nonemployeeCompensation', label: 'Nonemployee compensation', box: '1',
    value: '24500.00', originalValue: '24500.00', confidence: 0.97, type: 'currency',
    bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
  })
  expect(fields.map((f) => f.key)).toEqual(NEC_FORM.fieldDefs.map((f) => f.key))
})

test('NEC status tiers', () => {
  const low = { ...necFields(), recipientTIN: ex('123-45-6789', 0.5) }
  expect(buildDocument({ isLegible: true, fields: low }, NEC_FORM).status).toBe('needs_review')
  const empty = { ...necFields(), payerName: ex('', 0.95) }
  expect(buildDocument({ isLegible: true, fields: empty }, NEC_FORM).status).toBe('needs_review')
  expect(buildDocument({ isLegible: false, fields: necFields() }, NEC_FORM).status).toBe('failed')
})

test('a malformed payer TIN flags needs_review via format checks', () => {
  const bad = { ...necFields(), payerTIN: ex('1234', 0.95) }
  expect(buildDocument({ isLegible: true, fields: bad }, NEC_FORM).status).toBe('needs_review')
})
