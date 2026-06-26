import { isFieldReviewed, reviewSummary, unreviewedCount, canBeReady } from './review'
import type { Document, Field } from '../types'

const fld = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: 'v', originalValue: 'v', confidence: 0.95, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})
const doc = (fields: Field[], validationMessages?: Document['validationMessages']): Document => ({
  id: 'd', filename: 'f', fileUrl: 'u', formType: 'W-2', status: 'needs_review', reviewedAt: null, fields,
  ...(validationMessages ? { validationMessages } : {}),
})

test('isFieldReviewed: confirmed OR edited, not mere default', () => {
  expect(isFieldReviewed(fld({ confirmed: true }))).toBe(true)
  expect(isFieldReviewed(fld({ value: 'x', originalValue: 'y' }))).toBe(true)
  expect(isFieldReviewed(fld({}))).toBe(false)
})

test('reviewSummary counts corrected, confirmed, remaining', () => {
  const s = reviewSummary(doc([
    fld({ key: 'a', value: 'x', originalValue: 'y' }), // corrected
    fld({ key: 'b', confirmed: true }),                // confirmed unchanged
    fld({ key: 'c' }),                                 // remaining
    fld({ key: 'd' }),                                 // remaining
  ]))
  expect(s).toEqual({ total: 4, confirmed: 1, corrected: 1, remaining: 2 })
  expect(unreviewedCount(doc([fld({}), fld({ confirmed: true })]))).toBe(1)
})

test('canBeReady requires all fields resolved and no violations', () => {
  expect(canBeReady(doc([fld({ confirmed: true }), fld({ value: 'x', originalValue: 'y' })]))).toBe(true)
  expect(canBeReady(doc([fld({ confirmed: true }), fld({})]))).toBe(false)
  expect(canBeReady(doc([fld({ confirmed: true })], [{ fieldKey: 'k', message: 'bad' }]))).toBe(false)
})
