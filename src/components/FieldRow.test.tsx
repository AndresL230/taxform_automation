import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FieldRow from './FieldRow'
import type { Field } from '../types'

const base: Field = {
  key: 'wages', label: 'Wages, tips, other comp.', box: '1', value: '60,000.00',
  originalValue: '60,000.00', confidence: 0.97, type: 'currency',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 },
}

test('shows label and box, fires onSelect on row click', async () => {
  const onSelect = vi.fn()
  render(<FieldRow field={base} selected={false} onSelect={onSelect} onChange={() => {}} onConfirm={() => {}} />)
  expect(screen.getByText('Wages, tips, other comp.')).toBeInTheDocument()
  expect(screen.getByText(/Box 1/)).toBeInTheDocument()
  await userEvent.click(screen.getByText('Wages, tips, other comp.'))
  expect(onSelect).toHaveBeenCalled()
})

test('fires onSelect when the input is focused for editing', async () => {
  const onSelect = vi.fn()
  render(<FieldRow field={base} selected={false} onSelect={onSelect} onChange={() => {}} onConfirm={() => {}} />)
  await userEvent.click(screen.getByDisplayValue('60,000.00'))
  expect(onSelect).toHaveBeenCalled()
})

test('fires onChange when the input is edited', async () => {
  const onChange = vi.fn()
  render(<FieldRow field={base} selected={false} onSelect={() => {}} onChange={onChange} onConfirm={() => {}} />)
  await userEvent.type(screen.getByDisplayValue('60,000.00'), '0')
  expect(onChange).toHaveBeenCalled()
})

test('shows edited marker when value differs from original', () => {
  render(<FieldRow field={{ ...base, value: '61,000.00' }} selected={false} onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} />)
  expect(screen.getByText(/edited/i)).toBeInTheDocument()
})

test('confirm control fires onConfirm and does not select the row', async () => {
  const onConfirm = vi.fn()
  const onSelect = vi.fn()
  render(<FieldRow field={base} selected={false} onSelect={onSelect} onChange={() => {}} onConfirm={onConfirm} />)
  await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
  expect(onConfirm).toHaveBeenCalled()
  expect(onSelect).not.toHaveBeenCalled()
})

test('an edited field shows the original value and reads as reviewed', () => {
  render(<FieldRow field={{ ...base, value: '61,000.00' }} selected={false} onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} />)
  expect(screen.getByText(/was:\s*60,000\.00/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /confirm/i })).toHaveAttribute('aria-pressed', 'true')
})

test('a confirmed field reads as reviewed', () => {
  render(<FieldRow field={{ ...base, confirmed: true }} selected={false} onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} />)
  expect(screen.getByRole('button', { name: /confirm/i })).toHaveAttribute('aria-pressed', 'true')
})

test('renders a validation warning', () => {
  render(<FieldRow field={base} selected={false} validationMessage="Not a valid dollar amount." onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} />)
  expect(screen.getByTestId('field-warning')).toHaveTextContent('Not a valid dollar amount.')
})
