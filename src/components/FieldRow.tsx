import type { Field } from '../types'
import ConfidenceIndicator from './ConfidenceIndicator'
import { confidenceTier } from '../lib/format'
import { isFieldReviewed } from '../lib/review'

type Props = {
  field: Field
  selected: boolean
  validationMessage?: string
  acknowledged?: boolean
  onSelect: () => void
  onChange: (value: string) => void
  onConfirm: () => void
  onAcknowledge?: () => void
}

export default function FieldRow({ field, selected, validationMessage, acknowledged, onSelect, onChange, onConfirm, onAcknowledge }: Props) {
  const low = confidenceTier(field.confidence) === 'low'
  const edited = field.value !== field.originalValue
  const reviewed = isFieldReviewed(field)
  const flagged = !!validationMessage

  const rowCls = [
    'flex items-center gap-3 px-3.5 py-2.5 cursor-pointer lg:gap-4 lg:px-5 lg:py-3.5',
    selected
      ? 'bg-accent/10 shadow-[inset_3px_0_0_var(--color-accent)]'
      : flagged
        ? 'bg-flag-bg shadow-[inset_3px_0_0_var(--color-flag)]'
        : low
          ? 'bg-review-row'
          : 'bg-white',
  ].join(' ')

  return (
    <div className="border-b border-border">
      <div className={rowCls} onClick={onSelect}>
        <div className="w-[150px] shrink-0 lg:w-[210px]">
          <div className="text-xs font-medium text-ink lg:text-sm">
            {field.label}
            {edited && <span className="ml-1 text-[10px] italic text-muted lg:text-xs">· edited</span>}
          </div>
          {field.box && <div className="text-[10px] text-muted lg:text-xs">Box {field.box}</div>}
          {edited && (
            <div className="text-[10px] text-muted lg:text-xs" title={`Original AI value: ${field.originalValue}`}>
              was: {field.originalValue}
            </div>
          )}
        </div>
        <input
          className={`flex-1 rounded-[3px] border bg-white px-2.5 py-1.5 text-xs tabular-nums text-ink outline-none focus:border-accent lg:px-3 lg:py-2.5 lg:text-base ${low ? 'border-review-line' : 'border-border'}`}
          value={field.value}
          aria-label={field.label}
          onFocus={onSelect}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={`Confirm ${field.label}`}
          aria-pressed={reviewed}
          onClick={(e) => { e.stopPropagation(); onConfirm() }}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-[3px] border text-xs ${reviewed ? 'border-accent bg-accent text-white' : 'border-border bg-white text-muted'}`}
        >
          ✓
        </button>
        <ConfidenceIndicator confidence={field.confidence} />
      </div>
      {flagged && (acknowledged ? (
        <div data-testid="field-acknowledged" className="flex items-center justify-between gap-2 bg-paper-2 px-3.5 pb-2.5 pt-1 text-[11px] text-muted lg:px-5 lg:text-xs">
          <span>Acknowledged as correct: {validationMessage}</span>
          {onAcknowledge && (
            <button type="button" aria-label={`Acknowledge ${field.label}`} aria-pressed={true}
              onClick={(e) => { e.stopPropagation(); onAcknowledge() }}
              className="shrink-0 rounded-[3px] border border-accent bg-accent px-2 py-0.5 text-white">
              Acknowledged ✓
            </button>
          )}
        </div>
      ) : (
        <div data-testid="field-warning" className="flex items-center justify-between gap-2 bg-flag-bg px-3.5 pb-2.5 pt-1 text-[11px] text-flag lg:px-5 lg:text-xs">
          <span className="flex items-start gap-1.5"><span aria-hidden="true">!</span><span>{validationMessage}</span></span>
          {onAcknowledge && (
            <button type="button" aria-label={`Acknowledge ${field.label}`} aria-pressed={false}
              onClick={(e) => { e.stopPropagation(); onAcknowledge() }}
              className="shrink-0 rounded-[3px] border border-flag bg-white px-2 py-0.5 text-flag">
              Mark correct as-is
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
