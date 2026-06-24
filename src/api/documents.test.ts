// @vitest-environment node
import { beforeEach, expect, test, vi } from 'vitest'

const { FAKE } = vi.hoisted(() => ({
  FAKE: {
    detectedFormType: 'W-2',
    isLegibleW2: true,
    fields: Object.fromEntries(
      ['wages', 'federalWithholding', 'socialSecurityWages', 'employerEIN', 'employeeSSN', 'employeeName', 'employerName'].map(
        (k) => [k, { value: 'x', confidence: 0.95, bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 } }],
      ),
    ),
  },
}))

// Mock only the network client; keep the real Type enum so the request schema still builds.
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: vi.fn(function () {
      return {
        models: { generateContent: vi.fn(async () => ({ text: JSON.stringify(FAKE) })) },
      }
    }),
  }
})

import { handleApi } from './router'
import * as store from '../documents/store'
import type { Document } from '../types'

const ENV = { GEMINI_API_KEY: 'test-key' }

function uploadRequest(filename: string, type: string, bytes = new Uint8Array([1, 2, 3])): Request {
  const form = new FormData()
  form.append('file', new File([bytes], filename, { type }))
  return new Request('http://w/api/documents', { method: 'POST', body: form })
}

beforeEach(() => store.clear())

test('POST rejects an unsupported mime type with 415', async () => {
  const res = await handleApi(uploadRequest('photo.heic', 'image/heic'), ENV)
  expect(res.status).toBe(415)
  expect((await res.json()).error).toMatch(/unsupported/i)
})

test('POST with no file field returns 400', async () => {
  const res = await handleApi(new Request('http://w/api/documents', { method: 'POST', body: new FormData() }), ENV)
  expect(res.status).toBe(400)
})

test('POST extracts, stores, and returns a Document (mocked Gemini)', async () => {
  const res = await handleApi(uploadRequest('jordan_w2.png', 'image/png'), ENV)
  expect(res.status).toBe(200)
  const doc = (await res.json()) as Document
  expect(doc.filename).toBe('jordan_w2.png')
  expect(doc.formType).toBe('W-2')
  expect(doc.status).toBe('ready')
  expect(doc.fields).toHaveLength(7)
  expect(doc.fileUrl.startsWith('data:image/png;base64,')).toBe(true)
  expect(store.get(doc.id)?.filename).toBe('jordan_w2.png')
})

test('GET /api/documents lists stored documents', async () => {
  await handleApi(uploadRequest('a.png', 'image/png'), ENV)
  const res = await handleApi(new Request('http://w/api/documents'), ENV)
  expect(res.status).toBe(200)
  expect((await res.json()) as Document[]).toHaveLength(1)
})

test('GET /api/documents/:id returns the doc or 404', async () => {
  const created = (await (await handleApi(uploadRequest('a.png', 'image/png'), ENV)).json()) as Document
  const ok = await handleApi(new Request(`http://w/api/documents/${created.id}`), ENV)
  expect(ok.status).toBe(200)
  const missing = await handleApi(new Request('http://w/api/documents/nope'), ENV)
  expect(missing.status).toBe(404)
})

test('unsupported method on /api/documents returns 405', async () => {
  const res = await handleApi(new Request('http://w/api/documents', { method: 'DELETE' }), ENV)
  expect(res.status).toBe(405)
})
