import { useEffect, useRef } from 'react'
import type { BBox } from '../types'
import { renderPdfFirstPage } from '../lib/pdf'

type Props = { fileUrl: string; mimeType?: string; highlight: BBox | null; sourceMissing?: boolean }

export default function DocumentViewer({ fileUrl, mimeType, highlight, sourceMissing }: Props) {
  const isPdf = mimeType === 'application/pdf' || fileUrl.toLowerCase().endsWith('.pdf')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!isPdf || !canvas) return
    void renderPdfFirstPage(fileUrl, canvas).catch(() => {})
  }, [isPdf, fileUrl])

  return (
    <div className="relative">
      {isPdf ? (
        <canvas ref={canvasRef} data-testid="pdf-canvas" className="block w-full" />
      ) : (
        <img src={fileUrl} alt="Tax document" className="block w-full" />
      )}
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
      {!highlight && sourceMissing && (
        <div
          data-testid="source-missing"
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-flag-bg/90 px-3 py-1.5 text-center text-[11px] font-medium text-flag"
        >
          Source not located on the page
        </div>
      )}
    </div>
  )
}
