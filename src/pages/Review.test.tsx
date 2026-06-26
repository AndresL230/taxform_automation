import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Review from './Review'
import { DocumentsProvider } from '../state/DocumentsContext'

// The demo documents are PDFs; stub the pdf.js renderer so jsdom never loads pdf.js.
vi.mock('../lib/pdf', () => ({ renderPdfFirstPage: () => Promise.resolve() }))

const renderAt = (path: string) =>
  render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/review/:id" element={<Review />} />
          <Route path="/export" element={<div>EXPORT PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </DocumentsProvider>,
  )

test('unknown id shows not-found', () => {
  renderAt('/review/nope')
  expect(screen.getByText(/not found/i)).toBeInTheDocument()
})

test('renders fields and highlights the clicked field', async () => {
  renderAt('/review/doc-jdoe')
  expect(screen.getByText('jdoe_w2_blurry.pdf')).toBeInTheDocument()
  expect(screen.queryByTestId('bbox-highlight')).toBeNull()
  await userEvent.click(screen.getByText('Wages, tips, other comp.'))
  expect(screen.getByTestId('bbox-highlight')).toBeInTheDocument()
})

test('marking review on a flagged doc shows a blocking banner and does not navigate', async () => {
  renderAt('/review/doc-jdoe')
  await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }))
  expect(screen.getByText(/not finished yet/i)).toBeInTheDocument()
  expect(screen.queryByText('EXPORT PAGE')).toBeNull()
  expect(screen.getByText('Needs review')).toBeInTheDocument()
})

test('marking review on a ready doc navigates to the export page', async () => {
  renderAt('/review/doc-acme')
  await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }))
  expect(screen.getByText('EXPORT PAGE')).toBeInTheDocument()
})

test('failed doc shows failed callout and no Mark as reviewed button', () => {
  renderAt('/review/doc-scan')
  expect(screen.getByText(/extraction failed for this document/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /mark as reviewed/i })).toBeNull()
})

test('blocking banner heading clears once all issues are resolved', async () => {
  renderAt('/review/doc-jdoe')
  // trigger blocked state
  await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }))
  expect(screen.getByText(/not finished yet/i)).toBeInTheDocument()

  // confirm all 10 fields
  const confirmButtons = screen.getAllByRole('button', { name: /confirm/i })
  for (const btn of confirmButtons) {
    await userEvent.click(btn)
  }
  // acknowledge the flagged field
  const ackBtn = screen.queryByRole('button', { name: /acknowledge/i })
  if (ackBtn) await userEvent.click(ackBtn)

  // heading must be gone
  expect(screen.queryByText(/not finished yet/i)).toBeNull()
})

test('header has a Guide link to the walkthrough', () => {
  renderAt('/review/doc-jdoe')
  expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute('href', '/guide')
})

test('shows the per-field review summary', () => {
  renderAt('/review/doc-jdoe')
  expect(screen.getByText(/10 fields/i)).toBeInTheDocument()
  expect(screen.getByText(/to review/i)).toBeInTheDocument()
})

test('renders a validation warning for a flagged field', () => {
  renderAt('/review/doc-jdoe')
  expect(screen.getByTestId('field-warning')).toBeInTheDocument()
})
