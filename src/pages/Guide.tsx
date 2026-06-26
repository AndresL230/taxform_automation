import { Link } from 'react-router-dom'

type Step = { number: number; title: string; description: string; image: string; alt: string }

const STEPS: Step[] = [
  {
    number: 1,
    title: 'Upload',
    description:
      'Drag and drop your W-2 or 1099 PDFs onto the upload area, or click to browse. You can upload several at once.',
    image: '/guide/step-1-upload.png',
    alt: 'The upload area where you drop W-2 and 1099 PDFs',
  },
  {
    number: 2,
    title: 'Automatic extraction',
    description:
      'Each document is read automatically and labeled ready, needs review, or failed. Fields with low confidence or missing values are flagged for you.',
    image: '/guide/step-2-extraction.png',
    alt: 'The document list showing extracted forms with ready, needs review, and failed statuses',
  },
  {
    number: 3,
    title: 'Review and edit',
    description:
      'Open a document to check the extracted fields against the original PDF side by side. Fix any flagged field inline before you sign off.',
    image: '/guide/step-3-review.png',
    alt: 'The review screen with the PDF next to the extracted fields and confidence indicators',
  },
  {
    number: 4,
    title: 'Export',
    description:
      'When the fields look right, mark the document as reviewed and export the data as JSON or CSV.',
    image: '/guide/step-4-export.png',
    alt: 'The export menu on the review screen with JSON and CSV options',
  },
]

export default function Guide() {
  return (
    <div className="min-h-screen bg-paper pb-28">
      <header className="flex items-center gap-2.5 border-b border-border bg-white px-4 py-3 text-sm font-semibold">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-ink" />
          TaxExtract
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">How TaxExtract works</h1>
        <p className="mt-3 text-muted">
          A quick walkthrough before you start. TaxExtract reads your W-2 and 1099 forms and pulls
          out every field for review.
        </p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          W-2 · 1099-NEC · 1099-INT · 1099-DIV
        </p>

        <ol className="mt-10 space-y-12">
          {STEPS.map((step) => (
            <li key={step.number}>
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                  {step.number}
                </span>
                <h2 className="text-xl font-bold text-ink">{step.title}</h2>
              </div>
              <p className="mt-3 text-muted">{step.description}</p>
              <img
                src={step.image}
                alt={step.alt}
                loading="lazy"
                className="mt-4 w-full rounded-[3px] border border-border shadow-sm"
              />
            </li>
          ))}
        </ol>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-end px-6 py-3">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-[3px] bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b5d56] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Next
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
