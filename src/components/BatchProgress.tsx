export default function BatchProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div
      role="progressbar"
      aria-label="Extraction progress"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      className="rounded-[3px] border border-border bg-white px-4 py-3"
    >
      <div className="mb-2 flex items-center justify-between text-sm font-semibold">
        <span className="text-ink">Extracting {done} of {total}…</span>
        <span className="text-muted">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-proc-bg">
        <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
