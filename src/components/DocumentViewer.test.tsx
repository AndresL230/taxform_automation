import { render, screen } from '@testing-library/react'
import DocumentViewer from './DocumentViewer'

vi.mock('../lib/pdf', () => ({ renderPdfFirstPage: vi.fn(() => Promise.resolve()) }))
import { renderPdfFirstPage } from '../lib/pdf'

afterEach(() => vi.clearAllMocks())

test('renders an image and no overlay when highlight is null (image document)', () => {
  render(<DocumentViewer fileUrl="/w2.png" mimeType="image/png" highlight={null} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/w2.png')
  expect(screen.queryByTestId('bbox-highlight')).toBeNull()
  expect(screen.queryByTestId('pdf-canvas')).toBeNull()
})

test('positions the overlay from the bbox percentages (image document)', () => {
  render(<DocumentViewer fileUrl="/w2.png" mimeType="image/png" highlight={{ page: 1, x: 50, y: 10, w: 24, h: 13 }} />)
  const box = screen.getByTestId('bbox-highlight')
  expect(box).toHaveStyle({ left: '50%', top: '10%', width: '24%', height: '13%' })
})

test('renders a canvas (not an image) and triggers pdf rendering for a PDF document', () => {
  render(<DocumentViewer fileUrl="blob:abc" mimeType="application/pdf" highlight={null} />)
  expect(screen.getByTestId('pdf-canvas')).toBeInTheDocument()
  expect(screen.queryByRole('img')).toBeNull()
  expect(renderPdfFirstPage).toHaveBeenCalledWith('blob:abc', expect.any(HTMLCanvasElement))
})

test('detects a PDF by .pdf url even without a mime type, and overlays the bbox', () => {
  render(<DocumentViewer fileUrl="/demo/acme.pdf" highlight={{ page: 1, x: 5, y: 6, w: 7, h: 8 }} />)
  expect(screen.getByTestId('pdf-canvas')).toBeInTheDocument()
  expect(screen.getByTestId('bbox-highlight')).toHaveStyle({ left: '5%', top: '6%', width: '7%', height: '8%' })
})

test('shows a source-not-located note when sourceMissing and no highlight', () => {
  render(<DocumentViewer fileUrl="/w2.png" mimeType="image/png" highlight={null} sourceMissing />)
  expect(screen.getByTestId('source-missing')).toBeInTheDocument()
  expect(screen.queryByTestId('bbox-highlight')).toBeNull()
})
