import { render, screen } from '@testing-library/react'
import ProcessingIndicator from './ProcessingIndicator'

test('shows an extracting status with an animated bar', () => {
  const { container } = render(<ProcessingIndicator />)
  expect(screen.getByRole('status')).toHaveTextContent(/extracting/i)
  expect(container.querySelector('.animate-indeterminate')).not.toBeNull()
})
