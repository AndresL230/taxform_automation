import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Guide from './Guide'

test('guide renders the four steps with screenshots', () => {
  render(
    <MemoryRouter>
      <Guide />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: /how taxextract works/i })).toBeInTheDocument()
  for (const title of ['Upload', 'Automatic extraction', 'Review and edit', 'Export']) {
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  }
  expect(screen.getAllByRole('img')).toHaveLength(4)
})

test('guide Next button links into the app', () => {
  render(
    <MemoryRouter>
      <Guide />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute('href', '/app')
})
