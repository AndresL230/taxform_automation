# Stateless Extraction + Client-Owned State, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Worker a stateless extraction endpoint that returns an `ExtractionResult` (no stored state, no served files) and move all document state into the browser (`DocumentsContext`), with bundled static demo fixtures and a manual capture script.

**Architecture:** `extractW2` returns `ExtractionResult` (`{ fields, status, detectedFormType, error? }`); `POST /api/documents` returns it and the in-memory store plus both GET routes are deleted. A pure `applyExtraction(base, result)` helper assembles the final `Document` and is shared by the client merge and the fixtures. The client owns id/fileUrl (object URL from the uploaded file). Demo fixtures are built from committed seed JSON in the final `ExtractionResult` shape; a manual `vite-node` script overwrites them with authentic captures later.

**Tech Stack:** TypeScript, Cloudflare Workers, React, `@google/genai`, `zod`, Vitest, `vite-node`.

## Global Constraints

- **No em dash.** Never use an em dash or en dash in any artifact (code, copy, comments, fixtures, commit messages). Use a comma. Write ranges as "0 to 100".
- **Failed-path copy is exact:** `Detected {type}, not a legible W-2.` where `{type}` is `detectedFormType`. It lives only in `applyExtraction`.
- **`ExtractionResult` contract:** `{ fields: Field[]; status: DocStatus; detectedFormType: string; error?: string }`. `Document` and `Field` stay frozen; the server never fabricates `id`/`filename`/`fileUrl`.
- **Single shape source:** the capture script calls the same `extractW2` / `buildW2Document` path as production; no parallel transform.
- **bbox normalization lives inside `buildW2Document`** (identity today; any future 0-to-1000 or corner-coordinate conversion goes there). Fixtures are fixed at 0 to 100 x/y/w/h regardless. Do not build a conversion now.
- **Two JSON kinds:** seed/fixture JSON is a final-shape `ExtractionResult` the harness verifies against; tests mock the Gemini SDK and verify plumbing, not accuracy. The capture run hits the live API and is never in the green suite.
- **Field keys are production keys** (`federalWithholding`, `socialSecurityWages`), not the old `W2_FIELD_TEMPLATE` keys.
- **Fixture ids are preserved** (`doc-acme`, `doc-jdoe`, `doc-scan`, `doc-contoso`, `doc-smallco`) so `Review.test.tsx` stays green; only the old `processing` fixture changes status.
- **Commits:** omit `Co-Authored-By` trailers.
- **Baseline:** branch `feat/stateless-extraction` off `main` at `06bfd2e`; full suite 56 tests green, `tsc -b` clean before this work.

---

### Task 1: ExtractionResult type + applyExtraction helper

Additive and pure, nothing breaks. Lands the shared pieces the server, client, and fixtures all need.

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/applyExtraction.ts`
- Test: `src/lib/applyExtraction.test.ts`

**Interfaces:**
- Consumes: `Document`, `Field`, `DocStatus` from `src/types.ts`.
- Produces:
  - `ExtractionResult` type (in `types.ts`).
  - `DocumentBase = Pick<Document, 'id' | 'filename' | 'fileUrl' | 'reviewedAt'>`.
  - `applyExtraction(base: DocumentBase, result: ExtractionResult): Document`.

- [ ] **Step 1: Add the ExtractionResult type**

Append to `src/types.ts` (do not modify `Document` or `Field`):

```ts
export type ExtractionResult = {
  fields: Field[]
  status: DocStatus
  detectedFormType: string
  error?: string
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/applyExtraction.test.ts`:

```ts
import { applyExtraction, type DocumentBase } from './applyExtraction'
import type { ExtractionResult, Field } from '../types'

const base: DocumentBase = { id: 'd1', filename: 'a.png', fileUrl: 'blob:x', reviewedAt: null }
const field = (key: string, confidence: number): Field => ({
  key, label: key, box: '1', value: 'v', originalValue: 'v', confidence, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 },
})

test('ready result passes through and preserves base identity', () => {
  const result: ExtractionResult = { fields: [field('wages', 0.95)], status: 'ready', detectedFormType: 'W-2' }
  const doc = applyExtraction(base, result)
  expect(doc).toEqual({
    id: 'd1', filename: 'a.png', fileUrl: 'blob:x', reviewedAt: null,
    formType: 'W-2', status: 'ready', fields: result.fields,
  })
  expect(doc.error).toBeUndefined()
})

test('needs_review passes through with fields', () => {
  const result: ExtractionResult = { fields: [field('wages', 0.5)], status: 'needs_review', detectedFormType: 'W-2' }
  expect(applyExtraction(base, result).status).toBe('needs_review')
})

test('failed with a server error keeps that error', () => {
  const result: ExtractionResult = { fields: [], status: 'failed', detectedFormType: 'unknown', error: 'Empty response from model' }
  expect(applyExtraction(base, result).error).toBe('Empty response from model')
})

test('failed without a server error derives the detectedFormType message', () => {
  const result: ExtractionResult = { fields: [], status: 'failed', detectedFormType: '1099-NEC' }
  expect(applyExtraction(base, result).error).toBe('Detected 1099-NEC, not a legible W-2.')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/applyExtraction.test.ts`
Expected: FAIL, cannot resolve `./applyExtraction`.

- [ ] **Step 4: Write the helper**

Create `src/lib/applyExtraction.ts`:

```ts
import type { Document, ExtractionResult } from '../types'

export type DocumentBase = Pick<Document, 'id' | 'filename' | 'fileUrl' | 'reviewedAt'>

export function applyExtraction(base: DocumentBase, result: ExtractionResult): Document {
  const error =
    result.status === 'failed'
      ? result.error ?? `Detected ${result.detectedFormType}, not a legible W-2.`
      : result.error
  return {
    ...base,
    formType: 'W-2',
    status: result.status,
    fields: result.fields,
    ...(error ? { error } : {}),
  }
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/lib/applyExtraction.test.ts && npx tsc -b`
Expected: 4 tests PASS; `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/applyExtraction.ts src/lib/applyExtraction.test.ts
git commit -m "feat: add ExtractionResult type and applyExtraction merge helper"
```

---

### Task 2: Stateless server (atomic contract change)

`extractW2`'s return type, `documents.ts`, and `router.ts` are type-coupled, so they move together. Update the tests first (RED), then refactor (GREEN). This task deletes the store and removes the dead `toDataUrl`.

**Files:**
- Modify: `src/extract/w2.ts`
- Modify: `src/api/documents.ts`
- Modify: `src/api/router.ts`
- Delete: `src/documents/store.ts`, `src/documents/store.test.ts`
- Modify: `src/lib/bytes.ts`, `src/lib/bytes.test.ts`
- Rewrite test: `src/api/documents.test.ts`
- Rewrite test: `src/worker.test.ts`

**Interfaces:**
- Consumes: `ExtractionResult` (Task 1); `toBase64` from `src/lib/bytes.ts`.
- Produces: `extractW2(file, apiKey): Promise<ExtractionResult>`; `handlePostDocument(request, apiKey): Promise<Response>`; `handleApi(request, env: { GEMINI_API_KEY: string }): Promise<Response>` handling only `POST /api/documents`.

- [ ] **Step 1: Rewrite the server tests (RED)**

Replace `src/api/documents.test.ts` entirely:

```ts
// @vitest-environment node
import { expect, test, vi } from 'vitest'

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
  expect(result.fields).toHaveLength(7)
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
```

Replace `src/worker.test.ts` entirely:

```ts
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
```

Delete the store test:

```bash
git rm src/documents/store.test.ts
```

Remove the `toDataUrl` test from `src/lib/bytes.test.ts` (delete this block):

```ts
test('toDataUrl builds a data: URL with the mime type', () => {
  expect(toDataUrl(new Uint8Array([0x4d, 0x61, 0x6e]), 'image/png')).toBe('data:image/png;base64,TWFu')
})
```

and drop `toDataUrl` from its import so line 1 reads:

```ts
import { toUint8, toBase64 } from './bytes'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/api/documents.test.ts src/worker.test.ts`
Expected: FAIL. The current server returns a full `Document` (so `result.id` is defined and `result.fields` is missing on failure), the current router serves `GET /api/documents` (so the 405 test fails), and `worker.test.ts` no longer imports the store.

- [ ] **Step 3: Make extractW2 return an ExtractionResult**

In `src/extract/w2.ts`, change the type import line from:

```ts
import type { Document, DocStatus, Field } from '../types'
```

to:

```ts
import type { DocStatus, ExtractionResult, Field } from '../types'
```

Add a comment above the `bbox: ex.bbox,` line inside `buildW2Document` (marking the normalization seam):

```ts
      // bbox normalization seam: the prompt asks Gemini for 0 to 100 x/y/w/h, so this
      // is an identity pass-through today. Any future conversion (for example 0 to 1000
      // or corner coordinates) goes HERE, so fixtures stay 0 to 100 and production matches.
      bbox: ex.bbox,
```

Replace the entire `extractW2` function with:

```ts
export async function extractW2(
  file: { bytes: ArrayBuffer | Uint8Array; mimeType: string },
  apiKey: string,
): Promise<ExtractionResult> {
  try {
    const data = toBase64(file.bytes)
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { role: 'user', parts: [{ text: PROMPT }, { inlineData: { data, mimeType: file.mimeType } }] },
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    })
    const raw = response.text
    if (!raw) throw new Error('Empty response from model')
    const parsed = W2Extraction.parse(JSON.parse(raw))
    const { fields, status } = buildW2Document(parsed)
    return { fields, status, detectedFormType: parsed.detectedFormType }
  } catch (err) {
    return {
      fields: [],
      status: 'failed',
      detectedFormType: 'unknown',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
```

- [ ] **Step 4: Make the POST handler stateless**

Replace `src/api/documents.ts` entirely:

```ts
import { extractW2 } from '../extract/w2'

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
  const result = await extractW2({ bytes, mimeType: file.type }, apiKey)
  return json(result, 200)
}
```

- [ ] **Step 5: Make the router POST-only**

Replace `src/api/router.ts` entirely:

```ts
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
```

- [ ] **Step 6: Delete the store and the dead helper**

```bash
git rm src/documents/store.ts
```

In `src/lib/bytes.ts`, delete the `toDataUrl` function (the last export):

```ts
export function toDataUrl(bytes: ArrayBuffer | Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${toBase64(bytes)}`
}
```

- [ ] **Step 7: Run tests + typecheck (GREEN)**

Run: `npx vitest run && npx tsc -b`
Expected: full suite passes (store/GET tests gone, server tests pass), `tsc` exits 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: make /api/documents a stateless extraction endpoint; delete in-memory store"
```

---

### Task 3: Client DocumentsContext owns state

Rewrite `addDocuments` to create a provisional doc, POST the file, and merge via `applyExtraction`. Keep `doc-jdoe` in the test (fixtures are rewritten later, ids preserved).

**Files:**
- Modify: `src/state/DocumentsContext.tsx`
- Rewrite test: `src/state/DocumentsContext.test.tsx`

**Interfaces:**
- Consumes: `applyExtraction` (Task 1), `ExtractionResult` (Task 1), `fixtures` (existing).
- Produces: unchanged `DocumentsContextValue` (`documents`, `addDocuments`, `updateField`, `markReviewed`, `getDocument`); `addDocuments` now performs the real extraction POST.

- [ ] **Step 1: Rewrite the context test (RED)**

Replace `src/state/DocumentsContext.test.tsx` entirely:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react'
import { DocumentsProvider, useDocuments } from './DocumentsContext'
import type { ExtractionResult } from '../types'

const READY_RESULT: ExtractionResult = {
  status: 'ready',
  detectedFormType: 'W-2',
  fields: [
    {
      key: 'wages', label: 'Wages, tips, other comp.', box: '1', value: '100.00',
      originalValue: '100.00', confidence: 0.95, type: 'currency',
      bbox: { page: 1, x: 1, y: 1, w: 1, h: 1 },
    },
  ],
}

function Harness() {
  const { documents, addDocuments, updateField, markReviewed } = useDocuments()
  return (
    <div>
      <span data-testid="count">{documents.length}</span>
      <span data-testid="first-id">{documents[0]?.id}</span>
      <span data-testid="first-status">{documents[0]?.status}</span>
      <span data-testid="first-fileurl">{documents[0]?.fileUrl}</span>
      <span data-testid="first-fields">{documents[0]?.fields.length}</span>
      <button onClick={() => addDocuments([new File(['x'], 'new.png', { type: 'image/png' })])}>add</button>
      <button onClick={() => updateField('doc-jdoe', 'wages', '1.00')}>edit</button>
      <button onClick={() => markReviewed('doc-jdoe')}>review</button>
      <span data-testid="jdoe-wages">
        {documents.find((d) => d.id === 'doc-jdoe')?.fields.find((f) => f.key === 'wages')?.value}
      </span>
      <span data-testid="jdoe-status">{documents.find((d) => d.id === 'doc-jdoe')?.status}</span>
    </div>
  )
}

const setup = () => render(<DocumentsProvider><Harness /></DocumentsProvider>)

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  // jsdom implements neither of these
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})

test('seeds from fixtures', () => {
  setup()
  expect(screen.getByTestId('count').textContent).toBe('5')
})

test('upload creates a provisional processing doc, then merges the extraction', async () => {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, json: async () => READY_RESULT })
  setup()
  await act(async () => { screen.getByText('add').click() })
  // provisional is prepended immediately as processing, with the client object url
  expect(screen.getByTestId('count').textContent).toBe('6')
  expect(screen.getByTestId('first-status').textContent).toBe('processing')
  expect(screen.getByTestId('first-fileurl').textContent).toBe('blob:mock-url')
  const provisionalId = screen.getByTestId('first-id').textContent
  // after the POST resolves, the same doc keeps its id and fileUrl and gains fields/status
  await waitFor(() => expect(screen.getByTestId('first-status').textContent).toBe('ready'))
  expect(screen.getByTestId('first-id').textContent).toBe(provisionalId)
  expect(screen.getByTestId('first-fileurl').textContent).toBe('blob:mock-url')
  expect(screen.getByTestId('first-fields').textContent).toBe('1')
})

test('a non-2xx response flips the upload to failed', async () => {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
  setup()
  await act(async () => { screen.getByText('add').click() })
  await waitFor(() => expect(screen.getByTestId('first-status').textContent).toBe('failed'))
})

test('updateField changes a field value', () => {
  setup()
  act(() => { screen.getByText('edit').click() })
  expect(screen.getByTestId('jdoe-wages').textContent).toBe('1.00')
})

test('markReviewed flips status to ready', () => {
  setup()
  act(() => { screen.getByText('review').click() })
  expect(screen.getByTestId('jdoe-status').textContent).toBe('ready')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/state/DocumentsContext.test.tsx`
Expected: FAIL. The current `addDocuments` simulates with a timer (no `fetch`), so the upload never reaches `ready` and `first-fileurl` is the bundled image, not `blob:mock-url`.

- [ ] **Step 3: Rewrite the provider**

Replace `src/state/DocumentsContext.tsx` entirely:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Document, ExtractionResult } from '../types'
import { applyExtraction } from '../lib/applyExtraction'
import { fixtures } from '../fixtures'

type DocumentsContextValue = {
  documents: Document[]
  addDocuments(files: File[]): void
  updateField(docId: string, key: string, value: string): void
  markReviewed(docId: string): void
  getDocument(id: string): Document | undefined
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

async function postExtraction(file: File): Promise<ExtractionResult> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/documents', { method: 'POST', body })
  if (!res.ok) throw new Error(`Extraction request failed (HTTP ${res.status}).`)
  return (await res.json()) as ExtractionResult
}

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>(fixtures)
  const objectUrlsRef = useRef<string[]>([])

  // Revoke any object URLs created for uploads when the provider unmounts.
  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const addDocuments = useCallback((files: File[]) => {
    files.forEach((file) => {
      const id = crypto.randomUUID()
      const fileUrl = URL.createObjectURL(file)
      objectUrlsRef.current.push(fileUrl)

      const provisional: Document = {
        id, filename: file.name, fileUrl, formType: 'W-2',
        status: 'processing', reviewedAt: null, fields: [],
      }
      setDocuments((prev) => [provisional, ...prev])

      const base = { id, filename: file.name, fileUrl, reviewedAt: null }
      postExtraction(file)
        .then((result) => applyExtraction(base, result))
        .catch((err) =>
          applyExtraction(base, {
            fields: [], status: 'failed', detectedFormType: 'unknown',
            error: err instanceof Error ? err.message : 'Extraction request failed.',
          }),
        )
        .then((merged) => {
          setDocuments((prev) => prev.map((d) => (d.id === id ? merged : d)))
        })
    })
  }, [])

  const updateField = useCallback((docId: string, key: string, value: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, value } : f)) } : d,
      ),
    )
  }, [])

  const markReviewed = useCallback((docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: 'ready', reviewedAt: new Date().toISOString() } : d)),
    )
  }, [])

  const getDocument = useCallback((id: string) => documents.find((d) => d.id === id), [documents])

  const value = useMemo(
    () => ({ documents, addDocuments, updateField, markReviewed, getDocument }),
    [documents, addDocuments, updateField, markReviewed, getDocument],
  )

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext)
  if (!ctx) throw new Error('useDocuments must be used within DocumentsProvider')
  return ctx
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/state/DocumentsContext.test.tsx && npx tsc -b`
Expected: 5 tests PASS; `tsc` exits 0.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all green (the old fixtures and `Review.test.tsx` are untouched here).

- [ ] **Step 6: Commit**

```bash
git add src/state/DocumentsContext.tsx src/state/DocumentsContext.test.tsx
git commit -m "feat: DocumentsContext owns upload state via stateless extraction POST"
```

---

### Task 4: Static fixtures from seed JSON

Replace the hand-built fixtures with five demo docs assembled from committed seed `ExtractionResult` JSON through `applyExtraction`. Ids preserved; the old `processing` fixture becomes `needs_review`. Remove `W2_FIELD_TEMPLATE`.

**Files:**
- Create: `src/fixtures/acme.json`, `src/fixtures/jdoe.json`, `src/fixtures/scan.json`, `src/fixtures/contoso.json`, `src/fixtures/smallco.json`
- Rewrite: `src/fixtures.ts`
- Rewrite test: `src/fixtures.test.ts`

**Interfaces:**
- Consumes: `applyExtraction`, `DocumentBase`, `ExtractionResult` (Task 1); `w2Image` asset.
- Produces: `export const fixtures: Document[]` (5 docs). `W2_FIELD_TEMPLATE` no longer exported.

- [ ] **Step 1: Create the five seed JSON files (final ExtractionResult shape)**

`src/fixtures/acme.json` (ready):

```json
{
  "status": "ready",
  "detectedFormType": "W-2",
  "fields": [
    { "key": "wages", "label": "Wages, tips, other comp.", "box": "1", "value": "82300.00", "originalValue": "82300.00", "confidence": 0.99, "type": "currency", "bbox": { "page": 1, "x": 54.0, "y": 13.8, "w": 18.5, "h": 6.0 } },
    { "key": "federalWithholding", "label": "Federal income tax withheld", "box": "2", "value": "12140.00", "originalValue": "12140.00", "confidence": 0.98, "type": "currency", "bbox": { "page": 1, "x": 72.5, "y": 13.8, "w": 22.0, "h": 6.0 } },
    { "key": "socialSecurityWages", "label": "Social security wages", "box": "3", "value": "84000.00", "originalValue": "84000.00", "confidence": 0.97, "type": "currency", "bbox": { "page": 1, "x": 54.0, "y": 19.8, "w": 18.5, "h": 6.0 } },
    { "key": "employerEIN", "label": "Employer EIN", "box": "b", "value": "38-1099210", "originalValue": "38-1099210", "confidence": 0.96, "type": "ein", "bbox": { "page": 1, "x": 5.5, "y": 13.8, "w": 48.5, "h": 6.0 } },
    { "key": "employeeSSN", "label": "Employee SSN", "box": "a", "value": "401-55-8123", "originalValue": "401-55-8123", "confidence": 0.95, "type": "ssn", "bbox": { "page": 1, "x": 25.0, "y": 8.5, "w": 21.0, "h": 5.0 } },
    { "key": "employeeName", "label": "Employee name", "box": "e", "value": "Acme Test Employee", "originalValue": "Acme Test Employee", "confidence": 0.93, "type": "text", "bbox": { "page": 1, "x": 5.5, "y": 41.5, "w": 48.5, "h": 6.0 } },
    { "key": "employerName", "label": "Employer name", "box": "c", "value": "Acme Corporation", "originalValue": "Acme Corporation", "confidence": 0.94, "type": "text", "bbox": { "page": 1, "x": 5.5, "y": 19.3, "w": 48.5, "h": 16.0 } }
  ]
}
```

`src/fixtures/jdoe.json` (needs_review, two fields below 0.7):

```json
{
  "status": "needs_review",
  "detectedFormType": "W-2",
  "fields": [
    { "key": "wages", "label": "Wages, tips, other comp.", "box": "1", "value": "60000.00", "originalValue": "60000.00", "confidence": 0.97, "type": "currency", "bbox": { "page": 1, "x": 54.0, "y": 13.8, "w": 18.5, "h": 6.0 } },
    { "key": "federalWithholding", "label": "Federal income tax withheld", "box": "2", "value": "8400.00", "originalValue": "8400.00", "confidence": 0.92, "type": "currency", "bbox": { "page": 1, "x": 72.5, "y": 13.8, "w": 22.0, "h": 6.0 } },
    { "key": "socialSecurityWages", "label": "Social security wages", "box": "3", "value": "62000.00", "originalValue": "62000.00", "confidence": 0.61, "type": "currency", "bbox": { "page": 1, "x": 54.0, "y": 19.8, "w": 18.5, "h": 6.0 } },
    { "key": "employerEIN", "label": "Employer EIN", "box": "b", "value": "12-3456789", "originalValue": "12-3456789", "confidence": 0.95, "type": "ein", "bbox": { "page": 1, "x": 5.5, "y": 13.8, "w": 48.5, "h": 6.0 } },
    { "key": "employeeSSN", "label": "Employee SSN", "box": "a", "value": "123-45-6789", "originalValue": "123-45-6789", "confidence": 0.64, "type": "ssn", "bbox": { "page": 1, "x": 25.0, "y": 8.5, "w": 21.0, "h": 5.0 } },
    { "key": "employeeName", "label": "Employee name", "box": "e", "value": "John Q. Doe", "originalValue": "John Q. Doe", "confidence": 0.89, "type": "text", "bbox": { "page": 1, "x": 5.5, "y": 41.5, "w": 48.5, "h": 6.0 } },
    { "key": "employerName", "label": "Employer name", "box": "c", "value": "Contoso Freight Inc.", "originalValue": "Contoso Freight Inc.", "confidence": 0.9, "type": "text", "bbox": { "page": 1, "x": 5.5, "y": 19.3, "w": 48.5, "h": 16.0 } }
  ]
}
```

`src/fixtures/scan.json` (failed, non-W-2):

```json
{
  "status": "failed",
  "detectedFormType": "1099-NEC",
  "fields": []
}
```

`src/fixtures/contoso.json` (needs_review, one field below 0.7):

```json
{
  "status": "needs_review",
  "detectedFormType": "W-2",
  "fields": [
    { "key": "wages", "label": "Wages, tips, other comp.", "box": "1", "value": "75500.00", "originalValue": "75500.00", "confidence": 0.96, "type": "currency", "bbox": { "page": 1, "x": 54.0, "y": 13.8, "w": 18.5, "h": 6.0 } },
    { "key": "federalWithholding", "label": "Federal income tax withheld", "box": "2", "value": "10200.00", "originalValue": "10200.00", "confidence": 0.5, "type": "currency", "bbox": { "page": 1, "x": 72.5, "y": 13.8, "w": 22.0, "h": 6.0 } },
    { "key": "socialSecurityWages", "label": "Social security wages", "box": "3", "value": "77000.00", "originalValue": "77000.00", "confidence": 0.93, "type": "currency", "bbox": { "page": 1, "x": 54.0, "y": 19.8, "w": 18.5, "h": 6.0 } },
    { "key": "employerEIN", "label": "Employer EIN", "box": "b", "value": "55-2048817", "originalValue": "55-2048817", "confidence": 0.91, "type": "ein", "bbox": { "page": 1, "x": 5.5, "y": 13.8, "w": 48.5, "h": 6.0 } },
    { "key": "employeeSSN", "label": "Employee SSN", "box": "a", "value": "284-77-1042", "originalValue": "284-77-1042", "confidence": 0.88, "type": "ssn", "bbox": { "page": 1, "x": 25.0, "y": 8.5, "w": 21.0, "h": 5.0 } },
    { "key": "employeeName", "label": "Employee name", "box": "e", "value": "Maria Castillo", "originalValue": "Maria Castillo", "confidence": 0.9, "type": "text", "bbox": { "page": 1, "x": 5.5, "y": 41.5, "w": 48.5, "h": 6.0 } },
    { "key": "employerName", "label": "Employer name", "box": "c", "value": "Contoso Ltd.", "originalValue": "Contoso Ltd.", "confidence": 0.92, "type": "text", "bbox": { "page": 1, "x": 5.5, "y": 19.3, "w": 48.5, "h": 16.0 } }
  ]
}
```

`src/fixtures/smallco.json` (ready):

```json
{
  "status": "ready",
  "detectedFormType": "W-2",
  "fields": [
    { "key": "wages", "label": "Wages, tips, other comp.", "box": "1", "value": "44750.00", "originalValue": "44750.00", "confidence": 0.96, "type": "currency", "bbox": { "page": 1, "x": 54.0, "y": 13.8, "w": 18.5, "h": 6.0 } },
    { "key": "federalWithholding", "label": "Federal income tax withheld", "box": "2", "value": "5210.00", "originalValue": "5210.00", "confidence": 0.95, "type": "currency", "bbox": { "page": 1, "x": 72.5, "y": 13.8, "w": 22.0, "h": 6.0 } },
    { "key": "socialSecurityWages", "label": "Social security wages", "box": "3", "value": "45000.00", "originalValue": "45000.00", "confidence": 0.94, "type": "currency", "bbox": { "page": 1, "x": 54.0, "y": 19.8, "w": 18.5, "h": 6.0 } },
    { "key": "employerEIN", "label": "Employer EIN", "box": "b", "value": "77-0182234", "originalValue": "77-0182234", "confidence": 0.92, "type": "ein", "bbox": { "page": 1, "x": 5.5, "y": 13.8, "w": 48.5, "h": 6.0 } },
    { "key": "employeeSSN", "label": "Employee SSN", "box": "a", "value": "288-41-9930", "originalValue": "288-41-9930", "confidence": 0.9, "type": "ssn", "bbox": { "page": 1, "x": 25.0, "y": 8.5, "w": 21.0, "h": 5.0 } },
    { "key": "employeeName", "label": "Employee name", "box": "e", "value": "Dana Whitfield", "originalValue": "Dana Whitfield", "confidence": 0.88, "type": "text", "bbox": { "page": 1, "x": 5.5, "y": 41.5, "w": 48.5, "h": 6.0 } },
    { "key": "employerName", "label": "Employer name", "box": "c", "value": "Smallco LLC", "originalValue": "Smallco LLC", "confidence": 0.9, "type": "text", "bbox": { "page": 1, "x": 5.5, "y": 19.3, "w": 48.5, "h": 16.0 } }
  ]
}
```

- [ ] **Step 2: Rewrite the fixtures test (RED)**

Replace `src/fixtures.test.ts` entirely:

```ts
import { fixtures } from './fixtures'

test('there are 5 documents covering ready, needs_review, and failed', () => {
  expect(fixtures).toHaveLength(5)
  const statuses = fixtures.map((d) => d.status)
  expect(statuses).toContain('ready')
  expect(statuses).toContain('needs_review')
  expect(statuses).toContain('failed')
  expect(statuses).not.toContain('processing')
})

test('ready docs have all 7 fields, confident and non-empty, unedited', () => {
  for (const d of fixtures.filter((d) => d.status === 'ready')) {
    expect(d.fields).toHaveLength(7)
    expect(d.fields.every((f) => f.value !== '' && f.confidence >= 0.7)).toBe(true)
    expect(d.fields.every((f) => f.value === f.originalValue)).toBe(true)
  }
})

test('a needs_review doc has 7 fields with at least one below 0.7 confidence', () => {
  const nr = fixtures.find((d) => d.status === 'needs_review')!
  expect(nr.fields).toHaveLength(7)
  expect(nr.fields.some((f) => f.confidence < 0.7)).toBe(true)
})

test('the failed doc has no fields and the derived detectedFormType message', () => {
  const failed = fixtures.find((d) => d.status === 'failed')!
  expect(failed.fields).toHaveLength(0)
  expect(failed.error).toBe('Detected 1099-NEC, not a legible W-2.')
})

test('fields use the production W2_FIELDS keys in order', () => {
  const nr = fixtures.find((d) => d.status === 'needs_review')!
  expect(nr.fields.map((f) => f.key)).toEqual([
    'wages', 'federalWithholding', 'socialSecurityWages', 'employerEIN', 'employeeSSN', 'employeeName', 'employerName',
  ])
})

test('every field bbox is within 0 to 100', () => {
  for (const d of fixtures) {
    for (const f of d.fields) {
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(f.bbox[k]).toBeGreaterThanOrEqual(0)
        expect(f.bbox[k]).toBeLessThanOrEqual(100)
      }
    }
  }
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/fixtures.test.ts`
Expected: FAIL. The current `fixtures.ts` still exports a `processing` doc and the old keys, and `src/fixtures/*.json` are not yet wired in.

- [ ] **Step 4: Rewrite fixtures.ts**

Replace `src/fixtures.ts` entirely (this removes `W2_FIELD_TEMPLATE` and the old `BBOX`/`field` helpers):

```ts
import type { Document, ExtractionResult } from './types'
import { applyExtraction, type DocumentBase } from './lib/applyExtraction'
import w2Image from './assets/w2-sample.png'
import acme from './fixtures/acme.json'
import jdoe from './fixtures/jdoe.json'
import scan from './fixtures/scan.json'
import contoso from './fixtures/contoso.json'
import smallco from './fixtures/smallco.json'

const asResult = (j: unknown): ExtractionResult => j as ExtractionResult

type Entry = { base: DocumentBase; result: ExtractionResult }

const entries: Entry[] = [
  { base: { id: 'doc-acme', filename: 'acme_w2_2024.pdf', fileUrl: w2Image, reviewedAt: '2026-02-11T15:02:00.000Z' }, result: asResult(acme) },
  { base: { id: 'doc-jdoe', filename: 'jdoe_w2_blurry.jpg', fileUrl: w2Image, reviewedAt: null }, result: asResult(jdoe) },
  { base: { id: 'doc-scan', filename: 'scan_2231.pdf', fileUrl: w2Image, reviewedAt: null }, result: asResult(scan) },
  { base: { id: 'doc-contoso', filename: 'contoso_w2.png', fileUrl: w2Image, reviewedAt: null }, result: asResult(contoso) },
  { base: { id: 'doc-smallco', filename: 'smallco_w2.pdf', fileUrl: w2Image, reviewedAt: '2026-03-04T09:20:00.000Z' }, result: asResult(smallco) },
]

export const fixtures: Document[] = entries.map((e) => applyExtraction(e.base, e.result))
```

- [ ] **Step 5: Run test + typecheck + full suite**

Run: `npx vitest run && npx tsc -b`
Expected: all green. `fixtures.test.ts` passes; `Review.test.tsx` still passes (ids `doc-jdoe` needs_review with the "Wages, tips, other comp." field and `doc-scan` failed are preserved); `DocumentsContext.test.tsx` still passes (5 fixtures, `doc-jdoe` present). `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/fixtures.ts src/fixtures/ src/fixtures.test.ts
git commit -m "feat: build demo fixtures from seed ExtractionResult JSON via applyExtraction"
```

---

### Task 5: Capture script + vite-node wiring

Scaffold the manual capture script that overwrites the seed JSON with authentic live extractions. Not part of the green suite (it hits the live API). The user runs it with `GEMINI_API_KEY` and their own sample images.

**Files:**
- Create: `scripts/capture-fixtures.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `extractW2` (Task 2), sample assets in `src/assets/`.
- Produces: `npm run capture-fixtures`.

- [ ] **Step 1: Install vite-node**

Run: `npm install -D vite-node`
Expected: added to `devDependencies`.

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"` (after `"deploy"`):

```json
    "capture-fixtures": "vite-node scripts/capture-fixtures.ts"
```

- [ ] **Step 3: Write the capture script**

Create `scripts/capture-fixtures.ts`:

```ts
// Manual fixture-capture script. NOT part of the test suite.
// Hits the live Gemini API and overwrites the committed seed JSON in src/fixtures/
// with authentic extraction output.
//
// Run: GEMINI_API_KEY=... npm run capture-fixtures
//
// Invariant: this calls the SAME extractW2 production path, so captured fixtures are
// byte-identical in shape to what the server emits. It does no transform of its own.
import { readFile, writeFile } from 'node:fs/promises'
import { extractW2 } from '../src/extract/w2'

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('Set GEMINI_API_KEY to run the capture.')
  process.exit(1)
}

// Edit this manifest to match the sample images you place in src/assets/.
// `image` is read from src/assets/, `out` is written to src/fixtures/<out>.json.
// Add a non-W-2 image mapped to `scan` to capture an authentic failed result.
const SAMPLES: { image: string; mime: string; out: string }[] = [
  { image: 'w2-sample.png', mime: 'image/png', out: 'acme' },
]

for (const s of SAMPLES) {
  const bytes = await readFile(new URL(`../src/assets/${s.image}`, import.meta.url))
  const result = await extractW2({ bytes, mimeType: s.mime }, apiKey)
  const outUrl = new URL(`../src/fixtures/${s.out}.json`, import.meta.url)
  await writeFile(outUrl, JSON.stringify(result, null, 2) + '\n')
  console.log(`captured ${s.image} -> src/fixtures/${s.out}.json (status: ${result.status})`)
}
```

- [ ] **Step 4: Smoke-test the scaffold without hitting the API**

Run: `env -u GEMINI_API_KEY npx vite-node scripts/capture-fixtures.ts; echo "exit=$?"`
Expected: prints `Set GEMINI_API_KEY to run the capture.` and `exit=1`. Reaching the guard proves the script loads and its imports (`extractW2`, `@google/genai`, `zod`, `src/lib/bytes`) resolve, with no live API call.

- [ ] **Step 5: Confirm the suite is unaffected**

Run: `npx vitest run && npx tsc -b`
Expected: full suite green (the script is not imported by the app), `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/capture-fixtures.ts package.json package-lock.json
git commit -m "feat: scaffold manual capture-fixtures script via vite-node"
```

---

## Self-Review

**Spec coverage:**
- Section 1 stateless server (ExtractionResult, extractW2 refactor, stateless POST, delete store + GET routes, Env stays GEMINI_API_KEY, worker unchanged, remove toDataUrl) -> Task 1 (type) + Task 2. ✓
- Section 2 applyExtraction shared helper with the exact failed copy -> Task 1. ✓
- Section 3 client provisional doc + object URL + POST + merge + revoke-on-unmount, no PATCH -> Task 3. ✓
- Section 4 seed-then-capture fixtures, final shape, status variety (ready/needs_review/failed), production keys, drop processing -> Task 4. ✓
- Section 5 tests: stateless POST + 415 + graceful failure, keep join/status + bytes (minus toDataUrl), new applyExtraction + DocumentsContext tests, remove store + GET tests -> Tasks 1 to 4. ✓
- Capture script via production path, manual, not in suite -> Task 5. ✓
- bbox normalization seam comment in buildW2Document -> Task 2 Step 3. ✓
- Deferrals (PDF in viewer, next/prev, auth, IndexedDB) left unbuilt. ✓

**Placeholder scan:** every code/JSON/test block is complete; no TBD/TODO. ✓

**Type consistency:** `ExtractionResult` shape identical across Tasks 1 to 5; `extractW2(file, apiKey): Promise<ExtractionResult>`; `applyExtraction(base, result)`; `handleApi(request, env)`; field keys `federalWithholding`/`socialSecurityWages` in tests, seeds, and the FAKE mock. ✓

**No em dash:** plan, code, comments, copy, and commit messages use commas and "to" for ranges. The failed copy is `Detected {type}, not a legible W-2.` ✓

**Risk note (no green-suite impact):** the capture run is the accuracy check and the only place that could reveal Gemini's native bbox format differs from 0 to 100. If it does, the conversion goes inside `buildW2Document` (constraint 5) and the fixtures stay 0 to 100, so the harness needs no rework.
