export default function FormTypeBadge({ formType }: { formType: string }) {
  return (
    <span className="inline-flex items-center rounded-[3px] border border-border bg-white px-2 py-0.5 text-xs font-semibold text-ink">
      {formType}
    </span>
  )
}
