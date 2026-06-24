import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { DocumentsProvider } from './state/DocumentsContext'
import Home from './pages/Home'

test('Home route renders the upload zone', () => {
  render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="/" element={<Home />} /></Routes>
      </MemoryRouter>
    </DocumentsProvider>,
  )
  expect(screen.getByText(/drag/i)).toBeInTheDocument()
})
