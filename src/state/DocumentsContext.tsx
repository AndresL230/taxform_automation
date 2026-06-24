import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Document } from '../types'
import { fixtures, W2_FIELD_TEMPLATE } from '../fixtures'
import w2Image from '../assets/w2-sample.png' // match fixtures' asset

type DocumentsContextValue = {
  documents: Document[]
  addDocuments(files: File[]): void
  updateField(docId: string, key: string, value: string): void
  markReviewed(docId: string): void
  getDocument(id: string): Document | undefined
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

let seq = 0
const nextId = () => `doc-upload-${++seq}`

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>(fixtures)

  const addDocuments = useCallback((files: File[]) => {
    const created = files.map<Document>((file) => ({
      id: nextId(), filename: file.name, fileUrl: w2Image, formType: 'W-2',
      status: 'processing', reviewedAt: null, fields: [],
    }))
    setDocuments((prev) => [...created, ...prev])
    created.forEach((doc) => {
      setTimeout(() => {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, status: 'needs_review', fields: W2_FIELD_TEMPLATE.map((f) => ({ ...f })) }
              : d,
          ),
        )
      }, 1500)
    })
  }, [])

  const updateField = useCallback((docId: string, key: string, value: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, value } : f)) }
          : d,
      ),
    )
  }, [])

  const markReviewed = useCallback((docId: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, status: 'ready', reviewedAt: new Date().toISOString() } : d,
      ),
    )
  }, [])

  const getDocument = useCallback(
    (id: string) => documents.find((d) => d.id === id),
    [documents],
  )

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
