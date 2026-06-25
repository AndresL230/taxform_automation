import { handlePostDocument } from './documents'

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
    return methodNotAllowed(['POST'])
  }

  return new Response(JSON.stringify({ error: 'Not found.' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })
}
