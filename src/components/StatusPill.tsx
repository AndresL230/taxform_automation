import type { DocStatus } from '../types'

const META: Record<DocStatus, { label: string; text: string; bg: string; dot: string }> = {
  ready:        { label: 'Ready',        text: 'text-ready',  bg: 'bg-ready-bg',   dot: 'bg-ready' },
  needs_review: { label: 'Needs review', text: 'text-review', bg: 'bg-review-bg',  dot: 'bg-review' },
  processing:   { label: 'Processing',   text: 'text-muted', bg: 'bg-proc-bg',    dot: 'bg-muted' },
  failed:       { label: 'Failed',       text: 'text-failed', bg: 'bg-failed-bg', dot: 'bg-failed' },
}

export default function StatusPill({ status }: { status: DocStatus }) {
  const m = META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-0.5 text-xs font-semibold ${m.bg} ${m.text}`}>
      <span className={`h-2 w-2 rounded-[2px] ${m.dot}`} />
      {m.label}
    </span>
  )
}
