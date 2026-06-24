import type { Document } from '../types'

export function toJSON(doc: Document): string {
  return JSON.stringify(doc, null, 2)
}

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(doc: Document): string {
  const header = ['key', 'label', 'box', 'value', 'originalValue', 'confidence', 'type']
  const rows = doc.fields.map((f) =>
    [f.key, f.label, f.box, f.value, f.originalValue, f.confidence, f.type].map(csvCell).join(','),
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
