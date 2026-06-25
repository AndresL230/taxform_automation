import { buildDocument, type ParsedExtraction } from './build'
import { INT_FORM } from './int'
import type { Field } from '../types'

const ex = (value: string, confidence: number) => ({ value, confidence, bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 } })
const intFields = (): ParsedExtraction['fields'] => ({
  interestIncome: ex('1284.55', 0.97),
  earlyWithdrawalPenalty: ex('0.00', 0.96),
  interestUSSavingsBonds: ex('0.00', 0.95),
  federalWithholding: ex('0.00', 0.95),
  payerTIN: ex('98-7654321', 0.96),
  recipientTIN: ex('123-45-6789', 0.94),
  payerName: ex('First National Bank', 0.93),
  recipientName: ex('Dana Lee', 0.92),
})

test('buildDocument maps INT_FIELDS into 8 Fields in the frozen shape', () => {
  const { fields, status } = buildDocument({ isLegible: true, fields: intFields() }, INT_FORM)
  expect(status).toBe('ready')
  expect(fields).toHaveLength(8)
  const interest = fields.find((f) => f.key === 'interestIncome') as Field
  expect(interest).toEqual({
    key: 'interestIncome', label: 'Interest income', box: '1',
    value: '1284.55', originalValue: '1284.55', confidence: 0.97, type: 'currency',
    bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
  })
  expect(fields.map((f) => f.key)).toEqual(INT_FORM.fieldDefs.map((f) => f.key))
})

test('INT status tiers', () => {
  const low = { ...intFields(), recipientTIN: ex('123-45-6789', 0.5) }
  expect(buildDocument({ isLegible: true, fields: low }, INT_FORM).status).toBe('needs_review')
  const empty = { ...intFields(), payerName: ex('', 0.95) }
  expect(buildDocument({ isLegible: true, fields: empty }, INT_FORM).status).toBe('needs_review')
  expect(buildDocument({ isLegible: false, fields: intFields() }, INT_FORM).status).toBe('failed')
})
