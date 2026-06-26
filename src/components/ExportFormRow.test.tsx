import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ExportFormRow from './ExportFormRow'
import type { Document, Field } from '../types'

const fld = (over: Partial<Field>): Field => ({
  key: 'wages', label: 'Wages', box: '1', value: '100.00', originalValue: '100.00',
  confidence: 0.95, type: 'currency', bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})
const doc = (fields: Field[]): Document => ({
  id: 'doc-x', filename: 'x.pdf', fileUrl: 'u', formType: 'W-2', status: 'ready',
  reviewedAt: '2026-02-11T00:00:00.000Z', fields,
})
const renderRow = (d: Document, selected = true) =>
  render(<MemoryRouter><ExportFormRow doc={d} selected={selected} onToggle={() => {}} /></MemoryRouter>)

test('shows filename, summary, and a Review link', () => {
  renderRow(doc([fld({})]))
  expect(screen.getByText('x.pdf')).toBeInTheDocument()
  expect(screen.getByText(/1 fields/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/review/doc-x')
})

test('lists a corrected field as was then now', () => {
  renderRow(doc([fld({ value: '150.00', originalValue: '100.00' })]))
  expect(screen.getByText(/was 100.00/)).toBeInTheDocument()
  expect(screen.getByText(/now 150.00/)).toBeInTheDocument()
})

test('lists an acknowledged violation', () => {
  renderRow(doc([
    fld({ key: 'socialSecurityWages', label: 'Social security wages', value: '60000.00', originalValue: '60000.00' }),
    fld({ key: 'socialSecurityTaxWithheld', label: 'Social security tax withheld', value: '3000.00', originalValue: '3000.00', acknowledged: true }),
  ]))
  expect(screen.getByText(/acknowledged by reviewer/i)).toBeInTheDocument()
})

test('shows no changes when nothing was corrected or acknowledged', () => {
  renderRow(doc([fld({})]))
  expect(screen.getByText('no changes')).toBeInTheDocument()
})

test('checkbox reflects selected and fires onToggle', async () => {
  const onToggle = vi.fn()
  render(<MemoryRouter><ExportFormRow doc={doc([fld({})])} selected={false} onToggle={onToggle} /></MemoryRouter>)
  const cb = screen.getByRole('checkbox')
  expect(cb).not.toBeChecked()
  await userEvent.click(cb)
  expect(onToggle).toHaveBeenCalled()
})
