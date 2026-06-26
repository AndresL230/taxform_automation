import type { Field, ValidationMessage } from '../types'

const SSN_RE = /^[0-9Xx*]{3}-[0-9Xx*]{2}-[0-9Xx*]{4}$/
const EIN_RE = /^[0-9Xx*]{2}-[0-9Xx*]{7}$/

export function looksLikeSSN(value: string): boolean {
  return SSN_RE.test(value)
}

export function looksLikeEIN(value: string): boolean {
  return EIN_RE.test(value)
}

export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function looksLikeCurrency(value: string): boolean {
  return parseAmount(value) !== null
}

// Form-agnostic format checks. Skips empty values (the empty-value status path
// handles those) and text fields. Reused by every form's crossChecks.
export function formatChecks(fields: Field[]): ValidationMessage[] {
  const messages: ValidationMessage[] = []
  for (const fld of fields) {
    if (fld.value === '') continue
    if (fld.type === 'ssn' && !looksLikeSSN(fld.value)) {
      messages.push({ fieldKey: fld.key, message: 'Not a valid SSN format (###-##-####).' })
    } else if (fld.type === 'ein' && !looksLikeEIN(fld.value)) {
      messages.push({ fieldKey: fld.key, message: 'Not a valid EIN format (##-#######).' })
    } else if (fld.type === 'currency' && !looksLikeCurrency(fld.value)) {
      messages.push({ fieldKey: fld.key, message: 'Not a valid dollar amount.' })
    }
  }
  return messages
}
