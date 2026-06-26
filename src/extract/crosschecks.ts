import { formatChecks, parseAmount } from './checks'
import type { Field, ValidationMessage } from '../types'

const ARITHMETIC_TOLERANCE = 2.0 // dollars; covers cent-level rounding on both operands

// W-2 semantic checks: shared format checks plus the two payroll-tax identities.
// Skips an identity if either operand is empty or unparseable (defensive).
export function w2CrossChecks(fields: Field[]): ValidationMessage[] {
  const messages = formatChecks(fields)
  const byKey = new Map(fields.map((f) => [f.key, f]))

  const arithmetic = (taxKey: string, wageKey: string, rate: number, message: (exp: string, got: string) => string) => {
    const tax = byKey.get(taxKey)
    const wage = byKey.get(wageKey)
    if (!tax || !wage || tax.value === '' || wage.value === '') return
    const taxAmt = parseAmount(tax.value)
    const wageAmt = parseAmount(wage.value)
    if (taxAmt === null || wageAmt === null) return // bad format already reported
    const expected = wageAmt * rate
    if (Math.abs(taxAmt - expected) > ARITHMETIC_TOLERANCE) {
      messages.push({ fieldKey: taxKey, message: message(expected.toFixed(2), tax.value) })
    }
  }

  arithmetic('socialSecurityTaxWithheld', 'socialSecurityWages', 0.062, (exp, got) =>
    `Box 4 social security tax should be about 6.2% of Box 3 social security wages (expected ${exp}, got ${got}).`)
  arithmetic('medicareTaxWithheld', 'medicareWages', 0.0145, (exp, got) =>
    `Box 6 Medicare tax should be about 1.45% of Box 5 Medicare wages (expected ${exp}, got ${got}).`)

  return messages
}

// Resolve a form type to its cross-check function. Client-safe (imports only ./checks
// and types, never build/registry/@google/genai), so the client can recompute
// violations live. W-2 gets arithmetic + format; every other form gets format-only,
// matching the registry's assignment.
export function crossChecksFor(formType: string): (fields: Field[]) => ValidationMessage[] {
  return formType === 'W-2' ? w2CrossChecks : formatChecks
}
