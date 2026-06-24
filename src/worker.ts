interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    // Future extraction routes attach here:
    // if (url.pathname.startsWith('/api/')) return handleApi(request, env)
    void url
    return env.ASSETS.fetch(request)
  },
}
