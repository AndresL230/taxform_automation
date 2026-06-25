import { describe, it, expect } from 'vitest'
import {
  normalizeCurrency,
  normalizeSsn,
  normalizeEin,
  normalizeText,
  normalizeByType,
} from './normalize'

describe('normalizeCurrency', () => {
  it('strips dollar sign and thousands separators, keeps printed cents', () => {
    expect(normalizeCurrency('$84,200.00')).toBe('84200.00')
    expect(normalizeCurrency('84,200.00')).toBe('84200.00')
    expect(normalizeCurrency('1,234,567.89')).toBe('1234567.89')
  })
  it('does not invent or drop cents', () => {
    expect(normalizeCurrency('84200')).toBe('84200')
  })
  it('returns empty for empty', () => {
    expect(normalizeCurrency('')).toBe('')
  })
})

describe('normalizeSsn / normalizeEin', () => {
  it('preserves an SSN mask and uppercases it', () => {
    expect(normalizeSsn('xxx-xx-1234')).toBe('XXX-XX-1234')
    expect(normalizeSsn(' 123-45-6789 ')).toBe('123-45-6789')
  })
  it('trims an EIN', () => {
    expect(normalizeEin(' 12-3456789 ')).toBe('12-3456789')
  })
})

describe('normalizeText', () => {
  it('trims and collapses internal whitespace, keeps case', () => {
    expect(normalizeText('  Acme   Corp ')).toBe('Acme Corp')
  })
})

describe('normalizeByType', () => {
  it('dispatches by field type', () => {
    expect(normalizeByType('currency', '$1,000.00')).toBe('1000.00')
    expect(normalizeByType('ssn', 'xxx-xx-1234')).toBe('XXX-XX-1234')
    expect(normalizeByType('ein', ' 12-3456789 ')).toBe('12-3456789')
    expect(normalizeByType('text', '  a  b ')).toBe('a b')
  })
})
