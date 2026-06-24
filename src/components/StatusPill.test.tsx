import { render, screen } from '@testing-library/react'
import StatusPill from './StatusPill'

test.each([
  ['ready', 'Ready'],
  ['needs_review', 'Needs review'],
  ['processing', 'Processing'],
  ['failed', 'Failed'],
] as const)('renders %s label', (status, label) => {
  render(<StatusPill status={status} />)
  expect(screen.getByText(label)).toBeInTheDocument()
})
