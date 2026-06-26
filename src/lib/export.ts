import type { Document } from '../types'
import { isFieldReviewed } from './review'

export function toJSON(doc: Document): string {
  return JSON.stringify(doc, null, 2)
}

function csvCell(value: string | number | boolean): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(doc: Document): string {
  const header = ['key', 'label', 'box', 'value', 'originalValue', 'confidence', 'type', 'reviewed']
  const rows = doc.fields.map((f) =>
    [f.key, f.label, f.box, f.value, f.originalValue, f.confidence, f.type, isFieldReviewed(f)].map(csvCell).join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

// One JSON file: the full selected documents (carries the complete audit record,
// including confirmed/acknowledged/originalValue).
export function toCombinedJSON(docs: Document[]): string {
  return JSON.stringify(docs, null, 2)
}

// One CSV file in normalized long format (one row per field per document, with
// filename/formType provenance columns). Long format is chosen so mixed form types
// import cleanly downstream rather than fighting a wide table of disjoint columns.
export function toCombinedCSV(docs: Document[]): string {
  const header = ['filename', 'formType', 'fieldKey', 'fieldLabel', 'box', 'value']
  const rows = docs.flatMap((d) =>
    d.fields.map((f) => [d.filename, d.formType, f.key, f.label, f.box, f.value].map(csvCell).join(',')),
  )
  return [header.join(','), ...rows].join('\n')
}

export function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
