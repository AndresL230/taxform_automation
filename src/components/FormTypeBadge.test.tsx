import { render, screen } from '@testing-library/react'
import FormTypeBadge from './FormTypeBadge'

test('renders the form type', () => {
  render(<FormTypeBadge formType="W-2" />)
  expect(screen.getByText('W-2')).toBeInTheDocument()
})
