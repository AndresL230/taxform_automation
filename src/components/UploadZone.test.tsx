import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadZone from './UploadZone'

test('selecting files via the input calls onFiles', async () => {
  const onFiles = vi.fn()
  const { container } = render(<UploadZone onFiles={onFiles} />)
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, new File(['x'], 'a.pdf', { type: 'application/pdf' }))
  expect(onFiles).toHaveBeenCalledTimes(1)
  expect(onFiles.mock.calls[0][0][0].name).toBe('a.pdf')
})

test('dropping files calls onFiles', () => {
  const onFiles = vi.fn()
  render(<UploadZone onFiles={onFiles} />)
  const zone = screen.getByText(/drag/i).closest('div')!
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } })
  expect(onFiles).toHaveBeenCalled()
})
