import { render, screen } from '@testing-library/react'
import ConfidenceIndicator from './ConfidenceIndicator'

test('low confidence shows amber flag with exact % on hover only', () => {
  render(<ConfidenceIndicator confidence={0.61} />)
  const flag = screen.getByTitle('61%')
  expect(flag).toBeInTheDocument()
  expect(flag).toHaveAttribute('data-tier', 'low')
})

test('high confidence is not flagged as low', () => {
  render(<ConfidenceIndicator confidence={0.97} />)
  expect(screen.getByTitle('97%')).toHaveAttribute('data-tier', 'high')
})
