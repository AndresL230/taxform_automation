import { act, render, screen } from '@testing-library/react'
import { DocumentsProvider, useDocuments } from './DocumentsContext'

function Harness() {
  const { documents, addDocuments, updateField, markReviewed } = useDocuments()
  return (
    <div>
      <span data-testid="count">{documents.length}</span>
      <span data-testid="first-status">{documents[0]?.status}</span>
      <button onClick={() => addDocuments([new File(['x'], 'new.pdf')])}>add</button>
      <button onClick={() => updateField('doc-jdoe', 'wages', '1.00')}>edit</button>
      <button onClick={() => markReviewed('doc-jdoe')}>review</button>
      <span data-testid="jdoe-wages">
        {documents.find((d) => d.id === 'doc-jdoe')?.fields.find((f) => f.key === 'wages')?.value}
      </span>
      <span data-testid="jdoe-status">
        {documents.find((d) => d.id === 'doc-jdoe')?.status}
      </span>
    </div>
  )
}

const setup = () => render(<DocumentsProvider><Harness /></DocumentsProvider>)

test('seeds from fixtures', () => {
  setup()
  expect(screen.getByTestId('count').textContent).toBe('5')
})

test('addDocuments appends processing then flips after timeout', () => {
  vi.useFakeTimers()
  setup()
  act(() => { screen.getByText('add').click() })
  expect(screen.getByTestId('count').textContent).toBe('6')
  // newest upload is prepended and starts as processing
  expect(screen.getByTestId('first-status').textContent).toBe('processing')
  act(() => { vi.advanceTimersByTime(2000) })
  // after the simulated-extraction timeout it flips to a final status with fields
  expect(screen.getByTestId('first-status').textContent).toBe('needs_review')
  vi.useRealTimers()
})

test('updateField changes a field value', () => {
  setup()
  act(() => { screen.getByText('edit').click() })
  expect(screen.getByTestId('jdoe-wages').textContent).toBe('1.00')
})

test('markReviewed flips status to ready', () => {
  setup()
  act(() => { screen.getByText('review').click() })
  expect(screen.getByTestId('jdoe-status').textContent).toBe('ready')
})
