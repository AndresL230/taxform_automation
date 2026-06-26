import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'
import { DocumentsProvider } from '../state/DocumentsContext'

const renderHome = () =>
  render(<MemoryRouter><DocumentsProvider><Home /></DocumentsProvider></MemoryRouter>)

test('shows the upload zone and the seeded documents table', () => {
  renderHome()
  expect(screen.getByText(/drag/i)).toBeInTheDocument()
  expect(screen.getByText('acme_w2_2024.pdf')).toBeInTheDocument()
})

test('header has a Guide link to the walkthrough', () => {
  renderHome()
  expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute('href', '/guide')
})

test('header has an Export link to the export page', () => {
  renderHome()
  expect(screen.getByRole('link', { name: 'Export' })).toHaveAttribute('href', '/export')
})
