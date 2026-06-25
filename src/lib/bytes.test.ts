import { toUint8, toBase64 } from './bytes'

test('toUint8 passes through a Uint8Array and wraps an ArrayBuffer', () => {
  const u8 = new Uint8Array([1, 2, 3])
  expect(toUint8(u8)).toBe(u8)
  const wrapped = toUint8(u8.buffer)
  expect(Array.from(wrapped)).toEqual([1, 2, 3])
})

test('toBase64 encodes bytes to standard base64', () => {
  // "Man" -> "TWFu"
  expect(toBase64(new Uint8Array([0x4d, 0x61, 0x6e]))).toBe('TWFu')
})

test('toBase64 handles large inputs without overflowing the call stack', () => {
  const big = new Uint8Array(100_000).fill(65) // 'A' * 100000
  const b64 = toBase64(big)
  expect(atob(b64)).toHaveLength(100_000)
})
