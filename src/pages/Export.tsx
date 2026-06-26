import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocuments } from '../state/DocumentsContext'
import ExportFormRow from '../components/ExportFormRow'
import { isOfficiallyReviewed } from '../lib/review'
import { toCombinedJSON, toCombinedCSV, downloadFile } from '../lib/export'

export default function Export() {
  const { documents } = useDocuments()
  const reviewed = documents.filter(isOfficiallyReviewed)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(reviewed.map((d) => d.id)))
  const [menuOpen, setMenuOpen] = useState(false)

  const allSelected = reviewed.length > 0 && reviewed.every((d) => selectedIds.has(d.id))
  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(reviewed.map((d) => d.id)))

  const selectedDocs = reviewed.filter((d) => selectedIds.has(d.id))
  const exportJSON = () => { downloadFile('reviewed-forms.json', 'application/json', toCombinedJSON(selectedDocs)); setMenuOpen(false) }
  const exportCSV = () => { downloadFile('reviewed-forms.csv', 'text/csv', toCombinedCSV(selectedDocs)); setMenuOpen(false) }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border bg-white px-4 py-3">
        <Link to="/app" aria-label="Back to document list" className="rounded-[3px] border border-border bg-white px-2.5 py-1.5 text-sm">←</Link>
        <span className="text-sm font-semibold">Export reviewed forms</span>
        <div className="ml-auto flex items-center gap-3">
          {reviewed.length > 0 && (
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} />
              Select all
            </label>
          )}
          <div className="relative">
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="rounded-[3px] bg-accent px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Export selected ▾
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-32 rounded-[3px] border border-border bg-white py-1 shadow-sm">
                <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-2" onClick={exportJSON}>JSON</button>
                <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-2" onClick={exportCSV}>CSV</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {reviewed.length === 0 ? (
          <div className="py-16 text-center text-muted">
            <p>No reviewed forms yet. Review a document and mark it reviewed to export.</p>
            <Link to="/app" className="mt-2 inline-block font-semibold text-ink underline underline-offset-2">Back to documents</Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[3px] border border-border bg-white">
            {reviewed.map((d) => (
              <ExportFormRow key={d.id} doc={d} selected={selectedIds.has(d.id)} onToggle={() => toggle(d.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
