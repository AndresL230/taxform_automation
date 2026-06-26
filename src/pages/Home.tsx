import { useDocuments } from '../state/DocumentsContext'
import UploadZone from '../components/UploadZone'
import BatchProgress from '../components/BatchProgress'
import DocumentTable from '../components/DocumentTable'

export default function Home() {
  const { documents, batch, addDocuments } = useDocuments()
  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center gap-2.5 border-b border-border bg-white px-4 py-3 text-sm font-semibold">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-ink" />
        TaxExtract
        <span className="ml-auto text-xs font-medium text-muted">Tax preparer</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <section className="border-b border-border pb-10 pt-6 sm:pb-12 sm:pt-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            W-2 · 1099-NEC · 1099-INT · 1099-DIV
          </p>
          <h1 className="mt-3 text-5xl font-black leading-[0.95] tracking-tight text-ink sm:text-7xl">
            TaxExtract
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Extract every field from your W-2 and 1099 forms in{' '}
            <span className="font-semibold text-accent">seconds</span>, checked and ready to review.
          </p>
        </section>
        <div className="mt-8">
          <UploadZone onFiles={addDocuments} />
        </div>
        {batch && (
          <div className="mt-6">
            <BatchProgress done={batch.done} total={batch.total} />
          </div>
        )}
        {documents.length > 0 && (
          <div className="mt-6">
            <DocumentTable documents={documents} />
          </div>
        )}
      </main>
    </div>
  )
}
