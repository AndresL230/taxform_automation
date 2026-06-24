import type { BBox } from '../types'

export default function DocumentViewer({ fileUrl, highlight }: { fileUrl: string; highlight: BBox | null }) {
  return (
    <div className="relative">
      <img src={fileUrl} alt="Tax document" className="block w-full" />
      {highlight && (
        <div
          data-testid="bbox-highlight"
          className="pointer-events-none absolute rounded-[3px] border-2 border-accent bg-accent/20"
          style={{
            left: `${highlight.x}%`,
            top: `${highlight.y}%`,
            width: `${highlight.w}%`,
            height: `${highlight.h}%`,
          }}
        />
      )}
    </div>
  )
}
