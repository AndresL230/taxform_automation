import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DocumentTable from './DocumentTable'
import type { Document } from '../types'

const docs: Document[] = [
  { id: 'd1', filename: 'ready.pdf', fileUrl: '', formType: 'W-2', status: 'ready', reviewedAt: null, fields: [] },
  { id: 'd2', filename: 'busy.pdf', fileUrl: '', formType: 'W-2', status: 'processing', reviewedAt: null, fields: [] },
]

test('renders a row per document with a review link for ready docs', () => {
  render(<MemoryRouter><DocumentTable documents={docs} /></MemoryRouter>)
  expect(screen.getByText('ready.pdf')).toBeInTheDocument()
  const link = screen.getByRole('link', { name: /review/i })
  expect(link).toHaveAttribute('href', '/review/d1')
})

test('processing rows do not have a review link', () => {
  render(<MemoryRouter><DocumentTable documents={docs} /></MemoryRouter>)
  const row = screen.getByText('busy.pdf').closest('tr')!
  expect(within(row).queryByRole('link')).toBeNull()
})
