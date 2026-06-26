import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { DocumentsProvider } from './state/DocumentsContext'
import Home from './pages/Home'

test('app screen renders the upload zone', () => {
  render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={['/app']}>
        <Routes><Route path="/app" element={<Home />} /></Routes>
      </MemoryRouter>
    </DocumentsProvider>,
  )
  expect(screen.getByText(/drag/i)).toBeInTheDocument()
})
