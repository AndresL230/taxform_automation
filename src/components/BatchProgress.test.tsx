import { render, screen } from '@testing-library/react'
import BatchProgress from './BatchProgress'

test('shows X of Y, a percentage, and progressbar semantics', () => {
  render(<BatchProgress done={2} total={5} />)
  expect(screen.getByText(/extracting 2 of 5/i)).toBeInTheDocument()
  expect(screen.getByText('40%')).toBeInTheDocument()
  const bar = screen.getByRole('progressbar')
  expect(bar).toHaveAttribute('aria-valuenow', '2')
  expect(bar).toHaveAttribute('aria-valuemax', '5')
})
