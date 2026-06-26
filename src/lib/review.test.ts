import { isFieldReviewed, reviewSummary, unreviewedCount, canBeReady, currentViolations, isOfficiallyReviewed } from './review'
import type { Document, Field } from '../types'

const fld = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: 'v', originalValue: 'v', confidence: 0.95, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})
const doc = (fields: Field[]): Document => ({
  id: 'd', filename: 'f', fileUrl: 'u', formType: 'W-2', status: 'needs_review', reviewedAt: null, fields,
})

test('isFieldReviewed: confirmed OR edited, not mere default', () => {
  expect(isFieldReviewed(fld({ confirmed: true }))).toBe(true)
  expect(isFieldReviewed(fld({ value: 'x', originalValue: 'y' }))).toBe(true)
  expect(isFieldReviewed(fld({}))).toBe(false)
  expect(isFieldReviewed(fld({ acknowledged: true }))).toBe(true)
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

test('canBeReady requires every field reviewed', () => {
  expect(canBeReady(doc([fld({ confirmed: true }), fld({ value: 'x', originalValue: 'y' })]))).toBe(true)
  expect(canBeReady(doc([fld({ confirmed: true }), fld({})]))).toBe(false)
})

test('currentViolations recomputes from current values', () => {
  const flagged = [
    fld({ key: 'socialSecurityWages', type: 'currency', value: '60000.00', originalValue: '60000.00' }),
    fld({ key: 'socialSecurityTaxWithheld', type: 'currency', value: '3000.00', originalValue: '3720.00' }),
  ]
  expect(currentViolations(doc(flagged)).map((v) => v.fieldKey)).toEqual(['socialSecurityTaxWithheld'])
  const fixed = flagged.map((f) => (f.key === 'socialSecurityTaxWithheld' ? { ...f, value: '3720.00' } : f))
  expect(currentViolations(doc(fixed))).toEqual([])
})

test('canBeReady: a current violation blocks unless acknowledged', () => {
  const fields = [
    fld({ key: 'socialSecurityWages', type: 'currency', value: '60000.00', originalValue: '60000.00', confirmed: true }),
    fld({ key: 'socialSecurityTaxWithheld', type: 'currency', value: '3000.00', originalValue: '3000.00', confirmed: true }),
  ]
  expect(canBeReady(doc(fields))).toBe(false)
  const acked = fields.map((f) => (f.key === 'socialSecurityTaxWithheld' ? { ...f, acknowledged: true } : f))
  expect(canBeReady(doc(acked))).toBe(true)
})

test('reviewSummary folds an acknowledged unchanged field into confirmed', () => {
  expect(reviewSummary(doc([fld({ acknowledged: true })]))).toEqual({ total: 1, confirmed: 1, corrected: 0, remaining: 0 })
})

test('isOfficiallyReviewed is true only for ready with a reviewedAt', () => {
  const base = (over: Partial<import('../types').Document>) => ({ ...doc([]), ...over })
  expect(isOfficiallyReviewed(base({ status: 'ready', reviewedAt: '2026-01-01T00:00:00.000Z' }))).toBe(true)
  expect(isOfficiallyReviewed(base({ status: 'ready', reviewedAt: null }))).toBe(false)
  expect(isOfficiallyReviewed(base({ status: 'needs_review', reviewedAt: '2026-01-01T00:00:00.000Z' }))).toBe(false)
  expect(isOfficiallyReviewed(base({ status: 'failed', reviewedAt: '2026-01-01T00:00:00.000Z' }))).toBe(false)
})
