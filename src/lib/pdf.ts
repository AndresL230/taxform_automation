import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Render page 1 of a PDF into a canvas. pdf.js is imported lazily so the library
// (and its worker) only load when a PDF is actually viewed, keeping it out of the
// initial bundle and out of the unit suite (tests mock this module).
export async function renderPdfFirstPage(url: string, canvas: HTMLCanvasElement): Promise<void> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const pdf = await pdfjs.getDocument({ url }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport }).promise
}
