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
        <UploadZone onFiles={addDocuments} />
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
