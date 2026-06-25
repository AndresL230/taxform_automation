export default function ProcessingIndicator() {
  return (
    <span
      role="status"
      aria-label="Extracting"
      className="inline-flex items-center gap-2 text-xs font-semibold text-muted"
    >
      <span aria-hidden="true" className="relative inline-block h-1.5 w-16 overflow-hidden rounded-full bg-proc-bg">
        <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent animate-indeterminate" />
      </span>
      Extracting…
    </span>
  )
}
