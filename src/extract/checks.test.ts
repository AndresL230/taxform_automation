import { looksLikeSSN, looksLikeEIN, looksLikeCurrency, parseAmount, formatChecks } from './checks'
import type { Field } from '../types'

const f = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: '', originalValue: '', confidence: 0.95, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})

test('looksLikeSSN is mask-aware', () => {
  expect(looksLikeSSN('123-45-6789')).toBe(true)
  expect(looksLikeSSN('XXX-XX-1234')).toBe(true)
  expect(looksLikeSSN('123456789')).toBe(false)
  expect(looksLikeSSN('12-3')).toBe(false)
})

test('looksLikeEIN is mask-aware', () => {
  expect(looksLikeEIN('12-3456789')).toBe(true)
  expect(looksLikeEIN('XX-XXX6789')).toBe(true)
  expect(looksLikeEIN('123456789')).toBe(false)
})

test('parseAmount strips $ and commas, rejects junk', () => {
  expect(parseAmount('82,300.00')).toBe(82300)
  expect(parseAmount('$82300')).toBe(82300)
  expect(parseAmount('0.00')).toBe(0)
  expect(parseAmount('abc')).toBeNull()
  expect(looksLikeCurrency('1,000.00')).toBe(true)
  expect(looksLikeCurrency('N/A')).toBe(false)
})

test('formatChecks flags bad formats, skips empty values and text fields', () => {
  const fields = [
    f({ key: 'ssn', type: 'ssn', value: '12' }),
    f({ key: 'ein', type: 'ein', value: 'bad' }),
    f({ key: 'amt', type: 'currency', value: 'oops' }),
    f({ key: 'empty', type: 'ssn', value: '' }),
    f({ key: 'name', type: 'text', value: 'whatever' }),
    f({ key: 'okssn', type: 'ssn', value: '123-45-6789' }),
  ]
  const msgs = formatChecks(fields)
  expect(msgs.map((m) => m.fieldKey).sort()).toEqual(['amt', 'ein', 'ssn'])
})
