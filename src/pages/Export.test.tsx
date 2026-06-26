import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Export from './Export'
import { DocumentsProvider } from '../state/DocumentsContext'
import { downloadFile } from '../lib/export'

vi.mock('../lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/export')>()
  return { ...actual, downloadFile: vi.fn() }
})

const renderExport = () =>
  render(<DocumentsProvider><MemoryRouter><Export /></MemoryRouter></DocumentsProvider>)

test('lists only officially reviewed docs', () => {
  renderExport()
  expect(screen.getByText('acme_w2_2024.pdf')).toBeInTheDocument()
  expect(screen.getByText('smallco_w2.pdf')).toBeInTheDocument()
  expect(screen.getByText('globex_1099nec.pdf')).toBeInTheDocument()
  expect(screen.getByText('firstnatl_1099int.pdf')).toBeInTheDocument()
  expect(screen.queryByText('jdoe_w2_blurry.pdf')).toBeNull()
  expect(screen.queryByText('contoso_w2.pdf')).toBeNull()
  expect(screen.queryByText('vanguard_1099div.pdf')).toBeNull()
  expect(screen.queryByText('scan_2231.pdf')).toBeNull()
})

test('export is enabled by default and disabled when all deselected', async () => {
  renderExport()
  const exportBtn = screen.getByRole('button', { name: /export selected/i })
  expect(exportBtn).toBeEnabled()
  await userEvent.click(screen.getByRole('checkbox', { name: /select all/i }))
  expect(exportBtn).toBeDisabled()
})

test('choosing CSV triggers a combined download', async () => {
  renderExport()
  await userEvent.click(screen.getByRole('button', { name: /export selected/i }))
  await userEvent.click(screen.getByRole('button', { name: 'CSV' }))
  expect(downloadFile).toHaveBeenCalledWith('reviewed-forms.csv', 'text/csv', expect.any(String))
})

test('choosing JSON triggers a combined download', async () => {
  renderExport()
  await userEvent.click(screen.getByRole('button', { name: /export selected/i }))
  await userEvent.click(screen.getByRole('button', { name: 'JSON' }))
  expect(downloadFile).toHaveBeenCalledWith('reviewed-forms.json', 'application/json', expect.any(String))
})
