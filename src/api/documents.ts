import { extractDocument } from '../extract/extract'

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
  const result = await extractDocument({ bytes, mimeType: file.type }, apiKey)
  return json(result, 200)
}
