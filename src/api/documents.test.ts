// @vitest-environment node
import { expect, test, vi } from 'vitest'

const { FAKE } = vi.hoisted(() => {
  const values: Record<string, string> = {
    wages: '1000.00', federalWithholding: '100.00', socialSecurityWages: '1000.00',
    socialSecurityTaxWithheld: '62.00', medicareWages: '1000.00', medicareTaxWithheld: '14.50',
    employerEIN: '12-3456789', employeeSSN: '123-45-6789', employeeName: 'Jordan Reyes', employerName: 'Northwind LLC',
  }
  return {
    FAKE: {
      detectedFormType: 'W-2',
      isLegible: true,
      fields: Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, { value: v, confidence: 0.95, bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 } }]),
      ),
    },
  }
})

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: vi.fn(function () {
      return { models: { generateContent: vi.fn(async () => ({ text: JSON.stringify(FAKE) })) } }
    }),
  }
})

import { handleApi } from './router'
import type { ExtractionResult } from '../types'

const ENV = { GEMINI_API_KEY: 'test-key' }

function uploadRequest(filename: string, type: string, bytes = new Uint8Array([1, 2, 3])): Request {
  const form = new FormData()
  form.append('file', new File([bytes], filename, { type }))
  return new Request('http://w/api/documents', { method: 'POST', body: form })
}

test('POST returns an ExtractionResult and fabricates no document fields', async () => {
  const res = await handleApi(uploadRequest('jordan_w2.png', 'image/png'), ENV)
  expect(res.status).toBe(200)
  const result = (await res.json()) as ExtractionResult & Record<string, unknown>
  expect(result.status).toBe('ready')
  expect(result.detectedFormType).toBe('W-2')
  expect(result.fields).toHaveLength(10)
  // stateless: the server invents no document identity
  expect(result.id).toBeUndefined()
  expect(result.filename).toBeUndefined()
  expect(result.fileUrl).toBeUndefined()
})

test('POST rejects an unsupported mime type with 415', async () => {
  const res = await handleApi(uploadRequest('photo.heic', 'image/heic'), ENV)
  expect(res.status).toBe(415)
  expect((await res.json()).error).toMatch(/unsupported/i)
})

test('POST with no file field returns 400', async () => {
  const res = await handleApi(new Request('http://w/api/documents', { method: 'POST', body: new FormData() }), ENV)
  expect(res.status).toBe(400)
})

test('non-POST on /api/documents returns 405', async () => {
  const res = await handleApi(new Request('http://w/api/documents', { method: 'GET' }), ENV)
  expect(res.status).toBe(405)
})
