import { act, render, screen, waitFor } from '@testing-library/react'
import { DocumentsProvider, useDocuments } from './DocumentsContext'
import type { ExtractionResult } from '../types'

const READY_RESULT: ExtractionResult = {
  status: 'ready',
  detectedFormType: 'W-2',
  fields: [
    {
      key: 'wages', label: 'Wages, tips, other comp.', box: '1', value: '100.00',
      originalValue: '100.00', confidence: 0.95, type: 'currency',
      bbox: { page: 1, x: 1, y: 1, w: 1, h: 1 },
    },
  ],
}

function Harness() {
  const { documents, batch, addDocuments, updateField, markReviewed } = useDocuments()
  return (
    <div>
      <span data-testid="count">{documents.length}</span>
      <span data-testid="batch">{batch ? `${batch.done}/${batch.total}` : 'none'}</span>
      <span data-testid="first-id">{documents[0]?.id}</span>
      <span data-testid="first-status">{documents[0]?.status}</span>
      <span data-testid="first-fileurl">{documents[0]?.fileUrl}</span>
      <span data-testid="first-fields">{documents[0]?.fields.length}</span>
      <button onClick={() => addDocuments([new File(['x'], 'new.png', { type: 'image/png' })])}>add</button>
      <button onClick={() => updateField('doc-jdoe', 'wages', '1.00')}>edit</button>
      <button onClick={() => markReviewed('doc-jdoe')}>review</button>
      <span data-testid="jdoe-wages">
        {documents.find((d) => d.id === 'doc-jdoe')?.fields.find((f) => f.key === 'wages')?.value}
      </span>
      <span data-testid="jdoe-status">{documents.find((d) => d.id === 'doc-jdoe')?.status}</span>
    </div>
  )
}

const setup = () => render(<DocumentsProvider><Harness /></DocumentsProvider>)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  // jsdom implements neither of these
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

test('seeds from fixtures', () => {
  setup()
  expect(screen.getByTestId('count').textContent).toBe('6')
})

test('upload creates a provisional processing doc, then merges the extraction', async () => {
  // Hold the POST open so the provisional (processing) state is observable before the merge.
  let resolveFetch: (value: unknown) => void = () => {}
  ;(fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => { resolveFetch = r }))
  setup()
  act(() => { screen.getByText('add').click() })
  // provisional is prepended immediately as processing, with the client object url
  expect(screen.getByTestId('count').textContent).toBe('7')
  expect(screen.getByTestId('first-status').textContent).toBe('processing')
  expect(screen.getByTestId('first-fileurl').textContent).toBe('blob:mock-url')
  const provisionalId = screen.getByTestId('first-id').textContent
  // resolve the POST and flush the merge: the same doc keeps its id and fileUrl and gains fields/status
  await act(async () => { resolveFetch({ ok: true, status: 200, json: async () => READY_RESULT }) })
  expect(screen.getByTestId('first-status').textContent).toBe('ready')
  expect(screen.getByTestId('first-id').textContent).toBe(provisionalId)
  expect(screen.getByTestId('first-fileurl').textContent).toBe('blob:mock-url')
  expect(screen.getByTestId('first-fields').textContent).toBe('1')
})

test('a non-2xx response flips the upload to failed', async () => {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
  setup()
  await act(async () => { screen.getByText('add').click() })
  await waitFor(() => expect(screen.getByTestId('first-status').textContent).toBe('failed'))
})

test('batch progress tracks the run and clears when every document is done', async () => {
  let resolveFetch: (value: unknown) => void = () => {}
  ;(fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((r) => { resolveFetch = r }))
  setup()
  expect(screen.getByTestId('batch').textContent).toBe('none')
  act(() => { screen.getByText('add').click() })
  expect(screen.getByTestId('batch').textContent).toBe('0/1')
  await act(async () => { resolveFetch({ ok: true, status: 200, json: async () => READY_RESULT }) })
  expect(screen.getByTestId('batch').textContent).toBe('none')
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
