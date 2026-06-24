import { render, screen } from '@testing-library/react'
import DocumentViewer from './DocumentViewer'

test('renders the image and no overlay when highlight is null', () => {
  render(<DocumentViewer fileUrl="/w2.png" highlight={null} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/w2.png')
  expect(screen.queryByTestId('bbox-highlight')).toBeNull()
})

test('positions the overlay from the bbox percentages', () => {
  render(<DocumentViewer fileUrl="/w2.png" highlight={{ page: 1, x: 50, y: 10, w: 24, h: 13 }} />)
  const box = screen.getByTestId('bbox-highlight')
  expect(box).toHaveStyle({ left: '50%', top: '10%', width: '24%', height: '13%' })
})
