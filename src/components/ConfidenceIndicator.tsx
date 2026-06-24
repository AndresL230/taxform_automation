import { confidenceTier, formatPercent } from '../lib/format'

export default function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const tier = confidenceTier(confidence)
  const cls = tier === 'low' ? 'bg-review' : 'border border-border bg-transparent'
  return (
    <span
      data-tier={tier}
      title={formatPercent(confidence)}
      className={`inline-block h-2 w-2 rounded-[2px] ${cls}`}
    />
  )
}
