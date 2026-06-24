import { extractW2 } from '../extract/w2'
import { toDataUrl } from '../lib/bytes'
import * as store from '../documents/store'
import type { Document } from '../types'

const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg'])

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

export async function handlePostDocument(request: Request, apiKey: string): Promise<Response> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ error: 'Expected multipart/form-data with a "file" field.' }, 400)
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return json({ error: 'Missing "file" field in form data.' }, 400)
  }
  if (!ALLOWED.has(file.type)) {
    return json(
      { error: `Unsupported file type "${file.type || 'unknown'}". Allowed: application/pdf, image/png, image/jpeg.` },
      415,
    )
  }

  const bytes = await file.arrayBuffer()
  const extracted = await extractW2({ bytes, mimeType: file.type }, apiKey)
  const document: Document = {
    ...extracted,
    filename: file.name,
    fileUrl: toDataUrl(bytes, file.type),
  }
  store.put(document)
  return json(document, 200)
}

export function handleGetDocuments(): Response {
  return json(store.list(), 200)
}

export function handleGetDocument(id: string): Response {
  const doc = store.get(id)
  return doc ? json(doc, 200) : json({ error: 'Document not found.' }, 404)
}
