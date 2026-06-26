import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useDocuments } from '../state/DocumentsContext'
import DocumentViewer from '../components/DocumentViewer'
import FieldRow from '../components/FieldRow'
import StatusPill from '../components/StatusPill'
import FormTypeBadge from '../components/FormTypeBadge'
import { reviewSummary, unreviewedCount, canBeReady, currentViolations } from '../lib/review'
import { locateField } from '../lib/bbox'

export default function Review() {
  const { id } = useParams()
  const { getDocument, updateField, markReviewed, confirmField, acknowledgeField } = useDocuments()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const navigate = useNavigate()
  const [blocked, setBlocked] = useState(false)

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
  const located = selectedField ? locateField(selectedField) : { highlight: null, sourceMissing: false }
  const summary = reviewSummary(doc)
  const violations = currentViolations(doc)
  const messagesByField = new Map(violations.map((m) => [m.fieldKey, m.message]))
  const ackedKeys = new Set(doc.fields.filter((f) => f.acknowledged).map((f) => f.key))
  const stillBlocking = unreviewedCount(doc) > 0 || violations.some((v) => !ackedKeys.has(v.fieldKey))

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
              onClick={() => {
                const willBeReady = doc.status === 'ready' || canBeReady(doc)
                markReviewed(doc.id)
                if (willBeReady) navigate('/export')
                else setBlocked(true)
              }}
              className="rounded-[3px] border border-border bg-white px-3.5 py-2 text-sm font-semibold text-ink"
            >
              Mark as reviewed
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {blocked && stillBlocking && (
          <div className="mb-4 rounded-[3px] border border-flag/40 bg-flag-bg px-4 py-3 text-sm text-flag">
            <p className="font-semibold">This form is not finished yet.</p>
            {unreviewedCount(doc) > 0 && <p>{unreviewedCount(doc)} field(s) still need review. Confirm or correct them to finish.</p>}
            {violations.some((v) => !ackedKeys.has(v.fieldKey)) && <p>Resolve or acknowledge the flagged field before finishing.</p>}
          </div>
        )}
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
                <DocumentViewer fileUrl={doc.fileUrl} mimeType={doc.mimeType} highlight={located.highlight} sourceMissing={located.sourceMissing} />
              </div>
            </section>
            <section className="overflow-hidden rounded-[3px] border border-border bg-white">
              <div className="border-b border-border bg-paper-2 px-3 py-2 lg:px-4 lg:py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted lg:text-xs">Fields</div>
                <div className="mt-0.5 text-[11px] font-normal normal-case text-muted">
                  {summary.total} fields · {summary.confirmed} confirmed · {summary.corrected} corrected · {summary.remaining} to review
                </div>
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
                    validationMessage={messagesByField.get(f.key)}
                    acknowledged={f.acknowledged}
                    onAcknowledge={() => acknowledgeField(doc.id, f.key)}
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
