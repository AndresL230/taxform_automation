import type { Document, Field } from '../types'

// A field is reviewed when a human confirmed it or edited it. Selection/focus alone
// does not count (that is tracked transiently in the page, not on the field).
export function isFieldReviewed(field: Field): boolean {
  return field.confirmed === true || field.value !== field.originalValue
}

export function reviewSummary(doc: Document): { total: number; confirmed: number; corrected: number; remaining: number } {
  let confirmed = 0
  let corrected = 0
  let remaining = 0
  for (const f of doc.fields) {
    if (f.value !== f.originalValue) corrected++
    else if (f.confirmed === true) confirmed++
    else remaining++
  }
  return { total: doc.fields.length, confirmed, corrected, remaining }
}

export function unreviewedCount(doc: Document): number {
  return reviewSummary(doc).remaining
}

// A document earns ready only when every field is reviewed and no validation
// failures remain. Drives the reconciled markReviewed and is independent of model
// confidence.
export function canBeReady(doc: Document): boolean {
  const allResolved = doc.fields.every(isFieldReviewed)
  const hasViolations = (doc.validationMessages?.length ?? 0) > 0
  return allResolved && !hasViolations
}
