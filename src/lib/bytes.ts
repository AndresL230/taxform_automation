export function toUint8(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = toUint8(bytes)
  let binary = ''
  const chunk = 0x8000 // 32 KiB, keep String.fromCharCode arg count safe
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk))
  }
  return btoa(binary)
}
