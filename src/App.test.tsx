import { render, screen } from '@testing-library/react'
import App from './App'

test('App renders the product name', () => {
  render(<App />)
  expect(screen.getByText('TaxExtract')).toBeInTheDocument()
})
