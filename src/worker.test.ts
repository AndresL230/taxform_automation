// @vitest-environment node
import { expect, test, vi } from 'vitest'
import worker from './worker'

function env() {
  return { GEMINI_API_KEY: 'test-key', ASSETS: { fetch: vi.fn(async () => new Response('asset', { status: 200 })) } }
}

test('non-/api requests fall through to ASSETS.fetch', async () => {
  const e = env()
  const res = await worker.fetch(new Request('http://w/index.html'), e)
  expect(e.ASSETS.fetch).toHaveBeenCalledOnce()
  expect(await res.text()).toBe('asset')
})

test('/api/* requests are routed to the API (not ASSETS)', async () => {
  const e = env()
  // GET is routed to handleApi, which 405s since only POST is allowed; ASSETS is never touched.
  const res = await worker.fetch(new Request('http://w/api/documents'), e)
  expect(e.ASSETS.fetch).not.toHaveBeenCalled()
  expect(res.status).toBe(405)
  expect(res.headers.get('content-type')).toContain('application/json')
})
