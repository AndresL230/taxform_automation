import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDocuments } from '../state/DocumentsContext'
import DocumentViewer from '../components/DocumentViewer'
import FieldRow from '../components/FieldRow'
import StatusPill from '../components/StatusPill'
import FormTypeBadge from '../components/FormTypeBadge'
import { toJSON, toCSV, downloadFile } from '../lib/export'
import type { BBox } from '../types'

export default function Review() {
  const { id } = useParams()
  const { getDocument, updateField, markReviewed, confirmField } = useDocuments()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [menuOpen])

  const doc = id ? getDocument(id) : undefined

  if (!doc) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-ink">Document not found.</p>
        <Link to="/app" className="mt-2 inline-block font-semibold text-ink underline underline-offset-2">← Back</Link>
      </div>
    )
  }

  const selectedField = doc.fields.find((f) => f.key === selectedKey) ?? null
  const highlight: BBox | null = selectedField?.bbox ?? null
  const baseName = doc.filename.replace(/\.[^.]+$/, '')

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border bg-white px-4 py-3">
        <Link to="/app" aria-label="Back to document list" className="rounded-[3px] border border-border bg-white px-2.5 py-1.5 text-sm">←</Link>
        <span className="text-sm font-semibold">{doc.filename}</span>
        <FormTypeBadge formType={doc.formType} />
        <StatusPill status={doc.status} />
        <div className="ml-auto flex items-center gap-2">
          <Link to="/guide" className="px-2 py-1 text-sm font-medium text-muted transition-colors hover:text-ink">
            Guide
          </Link>
          {(doc.status === 'ready' || doc.status === 'needs_review') && (
            <button
              type="button"
              onClick={() => markReviewed(doc.id)}
              className="rounded-[3px] border border-border bg-white px-3.5 py-2 text-sm font-semibold text-ink"
            >
              Mark as reviewed
            </button>
          )}
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="rounded-[3px] bg-accent px-3.5 py-2 text-sm font-semibold text-white"
            >
              Export ▾
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-32 rounded-[3px] border border-border bg-white py-1 shadow-sm">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-2"
                  onClick={() => { downloadFile(`${baseName}.json`, 'application/json', toJSON(doc)); setMenuOpen(false) }}
                >
                  JSON
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-2"
                  onClick={() => { downloadFile(`${baseName}.csv`, 'text/csv', toCSV(doc)); setMenuOpen(false) }}
                >
                  CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {doc.status === 'processing' ? (
          <p className="text-muted">This document is still processing…</p>
        ) : doc.status === 'failed' ? (
          <div className="rounded-[3px] border border-failed/40 bg-failed-bg px-4 py-3 text-sm text-failed">
            Extraction failed for this document. It can't be reviewed, re-upload the file to try again.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
            <section className="overflow-hidden rounded-[3px] border border-border bg-white">
              <div className="border-b border-border bg-paper-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted lg:px-4 lg:py-2.5 lg:text-xs">Document</div>
              <div className="p-3.5 lg:p-5">
                <DocumentViewer fileUrl={doc.fileUrl} mimeType={doc.mimeType} highlight={highlight} />
              </div>
            </section>
            <section className="overflow-hidden rounded-[3px] border border-border bg-white">
              <div className="border-b border-border bg-paper-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted lg:px-4 lg:py-2.5 lg:text-xs">
                Fields · {doc.fields.length} extracted
              </div>
              {doc.fields.length === 0 ? (
                <p className="px-3.5 py-6 text-sm text-muted">No fields were extracted from this document.</p>
              ) : (
                doc.fields.map((f) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    selected={selectedKey === f.key}
                    onSelect={() => setSelectedKey(f.key)}
                    onChange={(value) => updateField(doc.id, f.key, value)}
                    onConfirm={() => confirmField(doc.id, f.key)}
                  />
                ))
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
