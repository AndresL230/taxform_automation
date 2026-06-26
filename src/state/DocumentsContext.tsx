import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Document, ExtractionResult } from '../types'
import { applyExtraction } from '../lib/applyExtraction'
import { canBeReady } from '../lib/review'
import { fixtures } from '../fixtures'

type BatchProgress = { done: number; total: number }

type DocumentsContextValue = {
  documents: Document[]
  batch: BatchProgress | null
  addDocuments(files: File[]): void
  updateField(docId: string, key: string, value: string): void
  confirmField(docId: string, key: string): void
  acknowledgeField(docId: string, key: string): void
  markReviewed(docId: string): void
  getDocument(id: string): Document | undefined
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

async function postExtraction(file: File): Promise<ExtractionResult> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/documents', { method: 'POST', body })
  if (!res.ok) throw new Error(`Extraction request failed (HTTP ${res.status}).`)
  return (await res.json()) as ExtractionResult
}

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>(fixtures)
  // Batch extraction progress for the active upload run; null when nothing is in flight.
  const [batch, setBatch] = useState<BatchProgress | null>(null)
  const objectUrlsRef = useRef<string[]>([])

  // Revoke any object URLs created for uploads when the provider unmounts.
  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const addDocuments = useCallback((files: File[]) => {
    if (files.length === 0) return
    setBatch((b) => ({ done: b?.done ?? 0, total: (b?.total ?? 0) + files.length }))
    files.forEach((file) => {
      const id = crypto.randomUUID()
      const fileUrl = URL.createObjectURL(file)
      objectUrlsRef.current.push(fileUrl)

      const provisional: Document = {
        id, filename: file.name, fileUrl, mimeType: file.type, formType: '',
        status: 'processing', reviewedAt: null, fields: [],
      }
      setDocuments((prev) => [provisional, ...prev])

      const base = { id, filename: file.name, fileUrl, mimeType: file.type, reviewedAt: null }
      postExtraction(file)
        .then((result) => applyExtraction(base, result))
        .catch((err) =>
          applyExtraction(base, {
            fields: [], status: 'failed', detectedFormType: 'unknown',
            error: err instanceof Error ? err.message : 'Extraction request failed.',
          }),
        )
        .then((merged) => {
          setDocuments((prev) => prev.map((d) => (d.id === id ? merged : d)))
          // Check this document off the batch; clear the banner once the run is done.
          setBatch((b) => {
            if (!b) return b
            const done = b.done + 1
            return done >= b.total ? null : { ...b, done }
          })
        })
    })
  }, [])

  const updateField = useCallback((docId: string, key: string, value: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, value } : f)) } : d,
      ),
    )
  }, [])

  const confirmField = useCallback((docId: string, key: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, confirmed: !f.confirmed } : f)) } : d,
      ),
    )
  }, [])

  const acknowledgeField = useCallback((docId: string, key: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, acknowledged: !f.acknowledged } : f)) } : d,
      ),
    )
  }, [])

  const markReviewed = useCallback((docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d
        // reviewedAt is always stamped (a human looked at this). Status only becomes
        // ready when the doc has actually earned it: all fields reviewed, no violations.
        return { ...d, status: canBeReady(d) ? 'ready' : d.status, reviewedAt: new Date().toISOString() }
      }),
    )
  }, [])

  const getDocument = useCallback((id: string) => documents.find((d) => d.id === id), [documents])

  const value = useMemo(
    () => ({ documents, batch, addDocuments, updateField, confirmField, acknowledgeField, markReviewed, getDocument }),
    [documents, batch, addDocuments, updateField, confirmField, acknowledgeField, markReviewed, getDocument],
  )

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext)
  if (!ctx) throw new Error('useDocuments must be used within DocumentsProvider')
  return ctx
}
