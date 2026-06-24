import { handleGetDocument, handleGetDocuments, handlePostDocument } from './documents'

function methodNotAllowed(allow: string[]): Response {
  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: allow.join(', ') },
  })
}

export async function handleApi(request: Request, env: { GEMINI_API_KEY: string }): Promise<Response> {
  const { pathname } = new URL(request.url)

  if (pathname === '/api/documents') {
    if (request.method === 'POST') return handlePostDocument(request, env.GEMINI_API_KEY)
    if (request.method === 'GET') return handleGetDocuments()
    return methodNotAllowed(['GET', 'POST'])
  }

  const match = pathname.match(/^\/api\/documents\/([^/]+)$/)
  if (match) {
    if (request.method === 'GET') return handleGetDocument(decodeURIComponent(match[1]))
    return methodNotAllowed(['GET'])
  }

  return new Response(JSON.stringify({ error: 'Not found.' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })
}
