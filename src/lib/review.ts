import type { Document, Field, ValidationMessage } from '../types'
import { crossChecksFor } from '../extract/crosschecks'

// A field is reviewed when a human confirmed it, acknowledged it (correct as-is), or
// edited it. Selection/focus alone does not count.
export function isFieldReviewed(field: Field): boolean {
  return field.confirmed === true || field.acknowledged === true || field.value !== field.originalValue
}

export function reviewSummary(doc: Document): { total: number; confirmed: number; corrected: number; remaining: number } {
  let confirmed = 0
  let corrected = 0
  let remaining = 0
  for (const f of doc.fields) {
    if (f.value !== f.originalValue) corrected++
    else if (f.confirmed === true || f.acknowledged === true) confirmed++
    else remaining++
  }
  return { total: doc.fields.length, confirmed, corrected, remaining }
}

export function unreviewedCount(doc: Document): number {
  return reviewSummary(doc).remaining
}

// Cross-checks recomputed live against the document's CURRENT field values (not the
// extraction-time snapshot), so an edit that makes a check pass clears its violation.
// Uses the genai-free resolver, so the client never pulls in @google/genai.
export function currentViolations(doc: Document): ValidationMessage[] {
  return crossChecksFor(doc.formType)(doc.fields)
}

// A document earns ready only when every field is reviewed and every current
// validation violation is acknowledged. The preparer, not the tool, is the authority.
export function canBeReady(doc: Document): boolean {
  const allReviewed = doc.fields.every(isFieldReviewed)
  const acked = new Set(doc.fields.filter((f) => f.acknowledged).map((f) => f.key))
  const unresolved = currentViolations(doc).some((v) => !acked.has(v.fieldKey))
  return allReviewed && !unresolved
}

export function isOfficiallyReviewed(doc: Document): boolean {
  return doc.status === 'ready' && doc.reviewedAt !== null
}
