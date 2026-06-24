import type { Document } from '../types'

// In-memory seam. Resets on Worker restart. Replaced by R2/D1 in a later step;
// callers depend only on put/get/list, never on this Map.
const docs = new Map<string, Document>()

export function put(doc: Document): void {
  docs.set(doc.id, doc)
}

export function get(id: string): Document | undefined {
  return docs.get(id)
}

export function list(): Document[] {
  return [...docs.values()]
}

export function clear(): void {
  docs.clear()
}
