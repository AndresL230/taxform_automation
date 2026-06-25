import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Document, ExtractionResult } from '../types'
import { applyExtraction } from '../lib/applyExtraction'
import { fixtures } from '../fixtures'

type DocumentsContextValue = {
  documents: Document[]
  addDocuments(files: File[]): void
  updateField(docId: string, key: string, value: string): void
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
  const objectUrlsRef = useRef<string[]>([])

  // Revoke any object URLs created for uploads when the provider unmounts.
  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const addDocuments = useCallback((files: File[]) => {
    files.forEach((file) => {
      const id = crypto.randomUUID()
      const fileUrl = URL.createObjectURL(file)
      objectUrlsRef.current.push(fileUrl)

      const provisional: Document = {
        id, filename: file.name, fileUrl, formType: 'W-2',
        status: 'processing', reviewedAt: null, fields: [],
      }
      setDocuments((prev) => [provisional, ...prev])

      const base = { id, filename: file.name, fileUrl, reviewedAt: null }
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

  const markReviewed = useCallback((docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: 'ready', reviewedAt: new Date().toISOString() } : d)),
    )
  }, [])

  const getDocument = useCallback((id: string) => documents.find((d) => d.id === id), [documents])

  const value = useMemo(
    () => ({ documents, addDocuments, updateField, markReviewed, getDocument }),
    [documents, addDocuments, updateField, markReviewed, getDocument],
  )

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext)
  if (!ctx) throw new Error('useDocuments must be used within DocumentsProvider')
  return ctx
}
