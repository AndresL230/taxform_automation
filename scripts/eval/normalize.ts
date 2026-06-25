import type { FieldType } from '../../src/types'

// Mirrors the production prompt's value-formatting rules so ground truth and
// model output compare on equal footing. The harness does no extra rounding.

export function normalizeCurrency(v: string): string {
  // Strip the dollar sign and thousands separators (commas, spaces). Keep the
  // decimal point and digits exactly as printed. Do not add or drop cents.
  return v.replace(/[$,\s]/g, '').trim()
}

export function normalizeSsn(v: string): string {
  // Compared as printed. Uppercase any mask characters so "xxx" equals "XXX".
  return v.trim().toUpperCase()
}

export function normalizeEin(v: string): string {
  return v.trim().toUpperCase()
}

export function normalizeText(v: string): string {
  // Verbatim except surrounding whitespace and collapsed internal whitespace runs.
  return v.trim().replace(/\s+/g, ' ')
}

export function normalizeByType(type: FieldType, v: string): string {
  switch (type) {
    case 'currency':
      return normalizeCurrency(v)
    case 'ssn':
      return normalizeSsn(v)
    case 'ein':
      return normalizeEin(v)
    case 'text':
      return normalizeText(v)
  }
}
