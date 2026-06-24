import type { Field } from '../types'
import ConfidenceIndicator from './ConfidenceIndicator'
import { confidenceTier } from '../lib/format'

type Props = {
  field: Field
  selected: boolean
  onSelect: () => void
  onChange: (value: string) => void
}

export default function FieldRow({ field, selected, onSelect, onChange }: Props) {
  const low = confidenceTier(field.confidence) === 'low'
  const edited = field.value !== field.originalValue

  const rowCls = [
    'flex items-center gap-3 border-b border-border px-3.5 py-2.5 cursor-pointer',
    selected ? 'bg-accent/10 shadow-[inset_3px_0_0_var(--color-accent)]' : low ? 'bg-review-row' : 'bg-white',
  ].join(' ')

  return (
    <div className={rowCls} onClick={onSelect}>
      <div className="w-[150px] shrink-0">
        <div className="text-xs font-medium text-ink">
          {field.label}
          {edited && <span className="ml-1 text-[10px] italic text-muted">· edited</span>}
        </div>
        <div className="text-[10px] text-muted">Box {field.box}</div>
      </div>
      <input
        className={`flex-1 rounded-[3px] border bg-white px-2.5 py-1.5 text-xs tabular-nums text-ink outline-none focus:border-accent ${low ? 'border-review-line' : 'border-border'}`}
        value={field.value}
        aria-label={field.label}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
      />
      <ConfidenceIndicator confidence={field.confidence} />
    </div>
  )
}
