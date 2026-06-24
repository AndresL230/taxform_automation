import { Link } from 'react-router-dom'
import type { Document } from '../types'
import StatusPill from './StatusPill'
import FormTypeBadge from './FormTypeBadge'

const TH = 'px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted'
const TD = 'px-3.5 py-3 border-t border-border align-middle'

export default function DocumentTable({ documents }: { documents: Document[] }) {
  return (
    <table className="w-full border-collapse rounded-[3px] border border-border bg-white text-sm">
      <thead className="bg-paper-2">
        <tr>
          <th className={TH}>Filename</th>
          <th className={TH}>Form</th>
          <th className={TH}>Status</th>
          <th className={`${TH} text-right`}>Action</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((d) => (
          <tr key={d.id}>
            <td className={`${TD} font-medium`}>{d.filename}</td>
            <td className={TD}><FormTypeBadge formType={d.formType} /></td>
            <td className={TD}><StatusPill status={d.status} /></td>
            <td className={`${TD} text-right`}>
              {d.status === 'processing' ? (
                <span className="text-muted/50">Review →</span>
              ) : (
                <Link to={`/review/${d.id}`} className="font-semibold text-ink underline underline-offset-2">
                  Review →
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
