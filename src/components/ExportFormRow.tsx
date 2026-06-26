import { Link } from 'react-router-dom'
import type { Document } from '../types'
import FormTypeBadge from './FormTypeBadge'
import { reviewSummary, currentViolations } from '../lib/review'

export default function ExportFormRow({ doc, selected, onToggle }: { doc: Document; selected: boolean; onToggle: () => void }) {
  const summary = reviewSummary(doc)
  const corrected = doc.fields.filter((f) => f.value !== f.originalValue)
  const ackedKeys = new Set(doc.fields.filter((f) => f.acknowledged).map((f) => f.key))
  const acknowledged = currentViolations(doc).filter((v) => ackedKeys.has(v.fieldKey))
  const labelOf = (key: string) => doc.fields.find((f) => f.key === key)?.label ?? key
  const reviewedDate = doc.reviewedAt ? doc.reviewedAt.slice(0, 10) : ''
  const hasAudit = corrected.length > 0 || acknowledged.length > 0

  return (
    <div className="border-b border-border px-3.5 py-3 lg:px-5">
      <div className="flex items-center gap-3">
        <input type="checkbox" aria-label={`Select ${doc.filename}`} checked={selected} onChange={onToggle} />
        <span className="text-sm font-medium text-ink">{doc.filename}</span>
        <FormTypeBadge formType={doc.formType} />
        <span className="text-[11px] text-muted">reviewed {reviewedDate}</span>
        <Link to={`/review/${doc.id}`} className="ml-auto text-sm font-semibold text-ink underline underline-offset-2">
          Review →
        </Link>
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {summary.total} fields · {summary.confirmed} confirmed · {summary.corrected} corrected · {summary.remaining} to review
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {!hasAudit && <span>no changes</span>}
        {corrected.map((f) => (
          <div key={f.key}>{f.label}: was {f.originalValue} → now {f.value}</div>
        ))}
        {acknowledged.map((v) => (
          <div key={v.fieldKey}>{labelOf(v.fieldKey)}: {v.message}, acknowledged by reviewer</div>
        ))}
      </div>
    </div>
  )
}
