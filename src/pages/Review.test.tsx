import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Review from './Review'
import { DocumentsProvider } from '../state/DocumentsContext'

const renderAt = (path: string) =>
  render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/review/:id" element={<Review />} />
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
  expect(screen.getByText('jdoe_w2_blurry.jpg')).toBeInTheDocument()
  expect(screen.queryByTestId('bbox-highlight')).toBeNull()
  await userEvent.click(screen.getByText('Wages, tips, other comp.'))
  expect(screen.getByTestId('bbox-highlight')).toBeInTheDocument()
})

test('mark as reviewed flips the status pill to Ready', async () => {
  renderAt('/review/doc-jdoe')
  await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }))
  expect(screen.getByText('Ready')).toBeInTheDocument()
})

test('failed doc shows failed callout and no Mark as reviewed button', () => {
  renderAt('/review/doc-scan')
  expect(screen.getByText(/extraction failed for this document/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /mark as reviewed/i })).toBeNull()
})
