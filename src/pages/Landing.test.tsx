import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Landing from './Landing'

test('landing shows the TaxExtract hero and a Get started link into the app', () => {
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'TaxExtract' })).toBeInTheDocument()
  expect(screen.getByText(/extract every field/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/guide')
})
