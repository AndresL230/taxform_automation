import { buildDocument, type ParsedExtraction } from './build'
import { DIV_FORM } from './div'
import type { Field } from '../types'

const ex = (value: string, confidence: number) => ({ value, confidence, bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 } })
const divFields = (): ParsedExtraction['fields'] => ({
  ordinaryDividends: ex('3420.00', 0.97),
  qualifiedDividends: ex('3100.00', 0.96),
  totalCapitalGain: ex('850.00', 0.95),
  federalWithholding: ex('0.00', 0.95),
  payerTIN: ex('98-7654321', 0.96),
  recipientTIN: ex('123-45-6789', 0.94),
  payerName: ex('Vanguard Brokerage', 0.93),
  recipientName: ex('Dana Lee', 0.92),
})

test('buildDocument maps DIV_FIELDS into 8 Fields in the frozen shape', () => {
  const { fields, status } = buildDocument({ isLegible: true, fields: divFields() }, DIV_FORM)
  expect(status).toBe('ready')
  expect(fields).toHaveLength(8)
  const ordinary = fields.find((f) => f.key === 'ordinaryDividends') as Field
  expect(ordinary).toEqual({
    key: 'ordinaryDividends', label: 'Total ordinary dividends', box: '1a',
    value: '3420.00', originalValue: '3420.00', confidence: 0.97, type: 'currency',
    bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
  })
  expect(fields.map((f) => f.key)).toEqual(DIV_FORM.fieldDefs.map((f) => f.key))
})

test('DIV status tiers', () => {
  const low = { ...divFields(), recipientTIN: ex('123-45-6789', 0.5) }
  expect(buildDocument({ isLegible: true, fields: low }, DIV_FORM).status).toBe('needs_review')
  const empty = { ...divFields(), payerName: ex('', 0.95) }
  expect(buildDocument({ isLegible: true, fields: empty }, DIV_FORM).status).toBe('needs_review')
  expect(buildDocument({ isLegible: false, fields: divFields() }, DIV_FORM).status).toBe('failed')
})
