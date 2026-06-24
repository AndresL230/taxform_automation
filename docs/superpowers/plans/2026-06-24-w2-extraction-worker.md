# W-2 Extraction in the Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `POST /api/documents` (Gemini W-2 extraction), `GET /api/documents`, and `GET /api/documents/:id` in the Cloudflare Worker, returning the frozen `Document` shape, backed by a swappable in-memory store.

**Architecture:** A pure extractor module (`src/extract/w2.ts`) calls Gemini via `@google/genai`, validates the response with Zod, and joins it against fixed `W2_FIELDS` into `Field[]` + status. Thin API handlers (`src/api/`) own multipart parsing, the mime gate, and the `data:` URL `fileUrl`; a store module (`src/documents/store.ts`) is the seam that R2/D1 replaces later. `src/worker.ts` routes `/api/*` to the handlers and everything else to `env.ASSETS`.

**Tech Stack:** TypeScript, Cloudflare Workers, `@google/genai@^2.10.0`, `zod@^4.4.3`, Vitest.

## Global Constraints

- **Frozen contract:** `src/types.ts` `Document`/`Field` are frozen. The ONLY permitted change is adding **optional** `error?: string` to `Document` (backward-compatible; no existing consumer reads it).
- **Verbatim pieces:** the extraction prompt text, the `W2Extraction` Zod schema fields, and the `W2_FIELDS` join constant are used exactly as given below — do not paraphrase or rename.
- **Field keys:** emit spec-verbatim keys `federalWithholding` / `socialSecurityWages` (not the fixtures' `fedWithholding` / `ssWages`).
- **No hardcoded secret:** `GEMINI_API_KEY` is a wrangler secret, reached only via `env`. Never commit a key value.
- **Gemini SDK (pinned to installed `@google/genai@2.10.0`):** model string `gemini-3.5-flash`; the request schema is a Google `Schema` built with the `Type` enum and passed as `config.responseSchema`; Zod is used only to validate the parsed response. Temperature `0`. The model-facing `Schema` omits numeric `min/max/int` constraints (Zod still enforces them on our side).
- **Mime allow-list:** `application/pdf`, `image/png`, `image/jpeg`. Everything else (including HEIC) → `415`.
- **`fileUrl`:** an inline `data:<mime>;base64,...` URL of the uploaded bytes (thin seam; R2 URL replaces it later).
- **Out of scope:** R2/D1 persistence, `DocumentsContext` wiring, multi-page, other form types, auth.
- **Commits:** this repo omits `Co-Authored-By` trailers (see memory `no-commit-coauthor`).
- **Baseline:** `npx tsc -b` exits 0 and `npx vitest run` passes 36 tests before this work. Deps `@google/genai` + `zod` are already in `package.json`.

---

### Task 1: Shared byte helpers

**Files:**
- Create: `src/lib/bytes.ts`
- Test: `src/lib/bytes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `toUint8(bytes: ArrayBuffer | Uint8Array): Uint8Array`
  - `toBase64(bytes: ArrayBuffer | Uint8Array): string` (standard base64)
  - `toDataUrl(bytes: ArrayBuffer | Uint8Array, mimeType: string): string` → `data:<mime>;base64,<b64>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/bytes.test.ts`:

```ts
import { toUint8, toBase64, toDataUrl } from './bytes'

test('toUint8 passes through a Uint8Array and wraps an ArrayBuffer', () => {
  const u8 = new Uint8Array([1, 2, 3])
  expect(toUint8(u8)).toBe(u8)
  const wrapped = toUint8(u8.buffer)
  expect(Array.from(wrapped)).toEqual([1, 2, 3])
})

test('toBase64 encodes bytes to standard base64', () => {
  // "Man" -> "TWFu"
  expect(toBase64(new Uint8Array([0x4d, 0x61, 0x6e]))).toBe('TWFu')
})

test('toBase64 handles large inputs without overflowing the call stack', () => {
  const big = new Uint8Array(100_000).fill(65) // 'A' * 100000
  const b64 = toBase64(big)
  expect(atob(b64)).toHaveLength(100_000)
})

test('toDataUrl builds a data: URL with the mime type', () => {
  expect(toDataUrl(new Uint8Array([0x4d, 0x61, 0x6e]), 'image/png')).toBe('data:image/png;base64,TWFu')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bytes.test.ts`
Expected: FAIL — `Failed to resolve import "./bytes"` / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/bytes.ts`:

```ts
export function toUint8(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = toUint8(bytes)
  let binary = ''
  const chunk = 0x8000 // 32 KiB — keep String.fromCharCode arg count safe
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function toDataUrl(bytes: ArrayBuffer | Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${toBase64(bytes)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bytes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bytes.ts src/lib/bytes.test.ts
git commit -m "feat: add shared base64/data-url byte helpers"
```

---

### Task 2: Frozen-type extension + W-2 extractor

**Files:**
- Modify: `src/types.ts` (add optional `error?: string` to `Document`)
- Create: `src/extract/w2.ts`
- Test: `src/extract/w2.test.ts`

**Interfaces:**
- Consumes: `toBase64` from `src/lib/bytes.ts`; `Document`, `Field`, `DocStatus` from `src/types.ts`.
- Produces:
  - `W2_FIELDS` — the fixed join constant (`as const`).
  - `type W2Extraction` — `z.infer` of the validation schema.
  - `buildW2Document(parsed: W2Extraction): { fields: Field[]; status: DocStatus }` — pure join + status.
  - `extractW2(file: { bytes: ArrayBuffer | Uint8Array; mimeType: string }, apiKey: string): Promise<Document>` — full extraction; never throws. (`apiKey` is a necessary second param: in a Worker the secret lives only on `env`, so the handler passes it in. `filename`/`fileUrl` are left as `''` placeholders for the POST handler to overwrite.)

> **Note on the two `failed` flavors:** `buildW2Document` always maps all seven fields, then computes status (`!isLegibleW2 → failed`). So a clean parse of a non-W-2 yields `status:'failed'` with seven mapped fields and **no** `error`. The `fields: []` + `error` shape comes only from the `extractW2` try/catch path.

- [ ] **Step 1: Ensure dependencies are installed**

Run: `npm install @google/genai zod`
Expected: both already present (`@google/genai@^2.10.0`, `zod@^4.4.3`); no errors.

- [ ] **Step 2: Add the optional error field to the frozen type**

In `src/types.ts`, change the `Document` type to add one optional line:

```ts
export type Document = {
  id: string
  filename: string
  fileUrl: string
  formType: 'W-2'
  status: DocStatus
  fields: Field[]
  reviewedAt: string | null
  error?: string
}
```

- [ ] **Step 3: Write the failing join test**

Create `src/extract/w2.test.ts`:

```ts
import { buildW2Document, W2_FIELDS, type W2Extraction } from './w2'
import type { Field } from '../types'

const ex = (value: string, confidence: number) => ({
  value,
  confidence,
  bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
})

const okFields = (): W2Extraction['fields'] => ({
  wages: ex('58500.00', 0.97),
  federalWithholding: ex('7920.00', 0.96),
  socialSecurityWages: ex('60000.00', 0.95),
  employerEIN: ex('94-2719303', 0.93),
  employeeSSN: ex('532-19-7766', 0.94),
  employeeName: ex('Jordan A. Reyes', 0.9),
  employerName: ex('Northwind Logistics LLC', 0.91),
})

const extraction = (isLegibleW2: boolean, fields: W2Extraction['fields']): W2Extraction => ({
  detectedFormType: 'W-2',
  isLegibleW2,
  fields,
})

test('maps W2_FIELDS into Field[] in the frozen shape with originalValue === value', () => {
  const { fields, status } = buildW2Document(extraction(true, okFields()))
  expect(status).toBe('ready')
  expect(fields).toHaveLength(7)
  const wages = fields.find((f) => f.key === 'wages') as Field
  expect(wages).toEqual({
    key: 'wages',
    label: 'Wages, tips, other comp.',
    box: '1',
    value: '58500.00',
    originalValue: '58500.00',
    confidence: 0.97,
    type: 'currency',
    bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
  })
  for (const f of fields) {
    expect(f.originalValue).toBe(f.value)
    expect(Object.keys(f).sort()).toEqual(
      ['bbox', 'box', 'confidence', 'key', 'label', 'originalValue', 'type', 'value'].sort(),
    )
  }
  expect(fields.map((f) => f.key)).toEqual(W2_FIELDS.map((f) => f.key))
})

test('status is needs_review when any field confidence < 0.7', () => {
  const f = okFields()
  f.socialSecurityWages = ex('60000.00', 0.5)
  expect(buildW2Document(extraction(true, f)).status).toBe('needs_review')
})

test('status is needs_review when any field value is empty', () => {
  const f = okFields()
  f.employeeName = ex('', 0.95)
  expect(buildW2Document(extraction(true, f)).status).toBe('needs_review')
})

test('status is failed when not a legible W-2, but fields are still mapped', () => {
  const { fields, status } = buildW2Document(extraction(false, okFields()))
  expect(status).toBe('failed')
  expect(fields).toHaveLength(7)
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/extract/w2.test.ts`
Expected: FAIL — cannot resolve `./w2`.

- [ ] **Step 5: Write the extractor**

Create `src/extract/w2.ts`:

```ts
import { GoogleGenAI, Type } from '@google/genai'
import type { Schema } from '@google/genai'
import { z } from 'zod'
import { toBase64 } from '../lib/bytes'
import type { Document, DocStatus, Field } from '../types'

const MODEL = 'gemini-3.5-flash'

// --- Validation schema (Zod). Also the source of the W2Extraction type. ---
const BBox = z.object({
  page: z.number().int(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})
const Extracted = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: BBox,
})
const W2Extraction = z.object({
  detectedFormType: z.string(),
  isLegibleW2: z.boolean(),
  fields: z.object({
    wages: Extracted,
    federalWithholding: Extracted,
    socialSecurityWages: Extracted,
    employerEIN: Extracted,
    employeeSSN: Extracted,
    employeeName: Extracted,
    employerName: Extracted,
  }),
})
export type W2Extraction = z.infer<typeof W2Extraction>

// --- Model-facing response schema (Google Schema via Type enum). ---
// Intentionally omits numeric min/max/int constraints; Zod enforces those on our side.
const extracted: Schema = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    bbox: {
      type: Type.OBJECT,
      properties: {
        page: { type: Type.NUMBER },
        x: { type: Type.NUMBER },
        y: { type: Type.NUMBER },
        w: { type: Type.NUMBER },
        h: { type: Type.NUMBER },
      },
      required: ['page', 'x', 'y', 'w', 'h'],
    },
  },
  required: ['value', 'confidence', 'bbox'],
}
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    detectedFormType: { type: Type.STRING },
    isLegibleW2: { type: Type.BOOLEAN },
    fields: {
      type: Type.OBJECT,
      properties: {
        wages: extracted,
        federalWithholding: extracted,
        socialSecurityWages: extracted,
        employerEIN: extracted,
        employeeSSN: extracted,
        employeeName: extracted,
        employerName: extracted,
      },
      required: [
        'wages',
        'federalWithholding',
        'socialSecurityWages',
        'employerEIN',
        'employeeSSN',
        'employeeName',
        'employerName',
      ],
    },
  },
  required: ['detectedFormType', 'isLegibleW2', 'fields'],
}

// --- Backend join. The model never generates these constants. ---
export const W2_FIELDS = [
  { key: 'wages', box: '1', label: 'Wages, tips, other comp.', type: 'currency' },
  { key: 'federalWithholding', box: '2', label: 'Federal income tax withheld', type: 'currency' },
  { key: 'socialSecurityWages', box: '3', label: 'Social security wages', type: 'currency' },
  { key: 'employerEIN', box: 'b', label: 'Employer EIN', type: 'ein' },
  { key: 'employeeSSN', box: 'a', label: 'Employee SSN', type: 'ssn' },
  { key: 'employeeName', box: 'e', label: 'Employee name', type: 'text' },
  { key: 'employerName', box: 'c', label: 'Employer name', type: 'text' },
] as const

const PROMPT = `You are a precise data-extraction engine for U.S. tax documents. You are given a
single document (a W-2 wage statement, or possibly something else). Extract only
the fields defined below and return them in the required JSON structure. You
transcribe what is printed. You do not calculate, infer, correct, or complete
values.

CORE RULES (these protect a tax preparer who relies on your output):
1. Never guess. If a field is not clearly present and legible, set its value to
   an empty string "" and its confidence at or below 0.3. A blank is recoverable.
   A confident wrong number is a liability.
2. Transcribe exactly what is printed. Do not round, do not reformat amounts
   beyond the normalization rules below, do not fix apparent typos, do not fill
   in missing digits.
3. If a value is partially obscured or masked, return only the characters you can
   actually read and lower confidence. Do not reconstruct masked digits (a masked
   SSN printed as XXX-XX-1234 is returned as printed).
4. Set isLegibleW2 to false if the document is not a W-2, or is too degraded to
   extract reliably. Always fill detectedFormType with your best identification
   ("1099-NEC", "1098", "unknown", etc.).

FIELDS TO EXTRACT (W-2):
- wages: Box 1, "Wages, tips, other compensation". Currency.
- federalWithholding: Box 2, "Federal income tax withheld". Currency.
- socialSecurityWages: Box 3, "Social security wages". Currency.
- employerEIN: Box b, the Employer Identification Number. Format ##-#######.
- employeeSSN: Box a, the employee's Social Security Number. Format ###-##-####.
- employeeName: Box e, the employee's full name as printed.
- employerName: Box c, the employer's name as printed (name only, not address).

VALUE FORMATTING:
- Currency: digits and a single decimal point only. Strip the dollar sign and
  thousands separators. Keep cents exactly as printed (84,200.00 becomes
  "84200.00"). If no cents are printed, do not invent them.
- SSN: ###-##-#### as printed. Preserve any masking.
- EIN: ##-####### as printed.
- Text: verbatim, including capitalization.

CONFIDENCE (0 to 1, your honest certainty the value is read correctly):
- 0.95 to 1.0: crisp, unambiguous printed text.
- 0.7 to 0.95: legible with minor noise, slight skew, or light compression.
- 0.3 to 0.7: degraded, faint, handwritten, or ambiguous.
- 0 to 0.3: barely legible, or the field is absent (value "").
Confidence is per field and independent.

BOUNDING BOXES (bbox): give the location of the VALUE itself (the printed data,
not the label, not the box outline) on the page.
- page: 1-based page number. For a single-page W-2 this is always 1.
- x: left edge of the value as a percentage of page WIDTH (0 to 100).
- y: top edge of the value as a percentage of page HEIGHT (0 to 100).
- w: value width as a percentage of page width.
- h: value height as a percentage of page height.
Box the value tightly. If you cannot locate a field, set bbox to
{page:1,x:0,y:0,w:0,h:0} and value to "".

Return only the JSON object defined by the schema. No prose, no markdown.`

export function buildW2Document(parsed: W2Extraction): { fields: Field[]; status: DocStatus } {
  const fields: Field[] = W2_FIELDS.map((f): Field => {
    const ex = parsed.fields[f.key]
    return {
      key: f.key,
      label: f.label,
      box: f.box,
      value: ex.value,
      originalValue: ex.value,
      confidence: ex.confidence,
      type: f.type,
      bbox: ex.bbox,
    }
  })

  let status: DocStatus
  if (!parsed.isLegibleW2) {
    status = 'failed'
  } else if (fields.some((f) => f.value === '' || f.confidence < 0.7)) {
    status = 'needs_review'
  } else {
    status = 'ready'
  }

  return { fields, status }
}

export async function extractW2(
  file: { bytes: ArrayBuffer | Uint8Array; mimeType: string },
  apiKey: string,
): Promise<Document> {
  const base = {
    id: crypto.randomUUID(),
    filename: '',
    fileUrl: '',
    formType: 'W-2',
    reviewedAt: null,
  } as const

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
    return { ...base, status, fields }
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      fields: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/extract/w2.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck**

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/extract/w2.ts src/extract/w2.test.ts package.json package-lock.json
git commit -m "feat: add Gemini W-2 extractor and Field[] join; add optional Document.error"
```

---

### Task 3: In-memory document store (the swap seam)

**Files:**
- Create: `src/documents/store.ts`
- Test: `src/documents/store.test.ts`

**Interfaces:**
- Consumes: `Document` from `src/types.ts`.
- Produces: `put(doc: Document): void`, `get(id: string): Document | undefined`, `list(): Document[]`, `clear(): void` (test reset). Handlers only ever call these — never the underlying `Map`. R2/D1 replaces this module later.

- [ ] **Step 1: Write the failing test**

Create `src/documents/store.test.ts`:

```ts
import { beforeEach, expect, test } from 'vitest'
import * as store from './store'
import type { Document } from '../types'

const doc = (id: string): Document => ({
  id,
  filename: `${id}.png`,
  fileUrl: 'data:image/png;base64,AAAA',
  formType: 'W-2',
  status: 'ready',
  fields: [],
  reviewedAt: null,
})

beforeEach(() => store.clear())

test('put then get returns the stored document', () => {
  const d = doc('a')
  store.put(d)
  expect(store.get('a')).toEqual(d)
})

test('get returns undefined for an unknown id', () => {
  expect(store.get('missing')).toBeUndefined()
})

test('list returns all stored documents', () => {
  store.put(doc('a'))
  store.put(doc('b'))
  expect(store.list().map((d) => d.id).sort()).toEqual(['a', 'b'])
})

test('put with an existing id overwrites', () => {
  store.put(doc('a'))
  store.put({ ...doc('a'), status: 'failed' })
  expect(store.get('a')?.status).toBe('failed')
  expect(store.list()).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/documents/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Write minimal implementation**

Create `src/documents/store.ts`:

```ts
import type { Document } from '../types'

// In-memory seam. Resets on Worker restart. Replaced by R2/D1 in a later step;
// callers depend only on put/get/list, never on this Map.
const docs = new Map<string, Document>()

export function put(doc: Document): void {
  docs.set(doc.id, doc)
}

export function get(id: string): Document | undefined {
  return docs.get(id)
}

export function list(): Document[] {
  return [...docs.values()]
}

export function clear(): void {
  docs.clear()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/documents/store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/documents/store.ts src/documents/store.test.ts
git commit -m "feat: add in-memory document store seam"
```

---

### Task 4: API handlers + router

**Files:**
- Create: `src/api/documents.ts`
- Create: `src/api/router.ts`
- Test: `src/api/documents.test.ts`

**Interfaces:**
- Consumes: `extractW2` from `src/extract/w2.ts`; `store` from `src/documents/store.ts`; `toDataUrl` from `src/lib/bytes.ts`; `Document` from `src/types.ts`.
- Produces:
  - `handlePostDocument(request: Request, apiKey: string): Promise<Response>`
  - `handleGetDocuments(): Response`
  - `handleGetDocument(id: string): Response`
  - `handleApi(request: Request, env: { GEMINI_API_KEY: string }): Promise<Response>` — routes the three endpoints; `404` unknown path, `405` wrong method.
- Response contract: success endpoints return the bare resource (`Document` or `Document[]`) as JSON; a failed extraction returns `200` with the failed `Document` (its `error` field set); client errors return `{ error: string }` with `400` / `404` / `405` / `415`.

- [ ] **Step 1: Write the failing tests**

Create `src/api/documents.test.ts`. The first line pins the Node environment so `Request.formData()`, `File`, and `FormData` behave like the Worker runtime (undici), not jsdom:

```ts
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
    GoogleGenAI: vi.fn(() => ({
      models: { generateContent: vi.fn(async () => ({ text: JSON.stringify(FAKE) })) },
    })),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/documents.test.ts`
Expected: FAIL — cannot resolve `./router`.

- [ ] **Step 3: Write the handlers**

Create `src/api/documents.ts`:

```ts
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
```

Create `src/api/router.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/documents.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/api/documents.ts src/api/router.ts src/api/documents.test.ts
git commit -m "feat: add /api/documents handlers (POST extract+store, GET list/by-id) with mime gate"
```

---

### Task 5: Wire the Worker + secret config

**Files:**
- Modify: `src/worker.ts`
- Modify: `wrangler.jsonc` (document the secret)
- Modify: `.gitignore` (ignore `.dev.vars`)
- Create: `.dev.vars.example`
- Test: `src/worker.test.ts`

**Interfaces:**
- Consumes: `handleApi` from `src/api/router.ts`.
- Produces: the default Worker `fetch` export; `Env` gains `GEMINI_API_KEY: string`. `/api/*` → `handleApi`; everything else → `env.ASSETS.fetch`.

- [ ] **Step 1: Write the failing seam test**

Create `src/worker.test.ts`:

```ts
// @vitest-environment node
import { expect, test, vi } from 'vitest'
import worker from './worker'
import * as store from './documents/store'

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
  store.clear()
  const res = await worker.fetch(new Request('http://w/api/documents'), e)
  expect(e.ASSETS.fetch).not.toHaveBeenCalled()
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('application/json')
  expect(await res.json()).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/worker.test.ts`
Expected: FAIL — `/api/*` currently falls through to `ASSETS.fetch`, so the second test fails (`ASSETS.fetch` was called / status not JSON).

- [ ] **Step 3: Wire the Worker**

Replace `src/worker.ts` with:

```ts
import { handleApi } from './api/router'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  GEMINI_API_KEY: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return handleApi(request, env)
    return env.ASSETS.fetch(request)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/worker.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Document the secret (no key value committed)**

Replace `wrangler.jsonc` with (adds a comment documenting the secret):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "taxform-automation",
  "main": "src/worker.ts",
  "compatibility_date": "2026-06-01",
  // GEMINI_API_KEY is a secret, not a var. Production: `wrangler secret put GEMINI_API_KEY`.
  // Local dev: put `GEMINI_API_KEY=...` in .dev.vars (gitignored; see .dev.vars.example).
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

Create `.dev.vars.example`:

```
# Copy to .dev.vars (gitignored) for local `wrangler dev`. Do not commit real keys.
GEMINI_API_KEY=
```

Append `.dev.vars` to `.gitignore` (the file currently ignores `.wrangler/` on line 7; add the new line near it):

```
.dev.vars
```

- [ ] **Step 6: Full typecheck + full test suite**

Run: `npx tsc -b && npx vitest run`
Expected: `tsc` exits 0; all tests pass (36 baseline + new: bytes 4, w2 4, store 4, api 6, worker 2 = 56 total).

- [ ] **Step 7: Commit**

```bash
git add src/worker.ts wrangler.jsonc .gitignore .dev.vars.example
git commit -m "feat: route /api/* to handlers in the Worker; document GEMINI_API_KEY secret"
```

---

## Self-Review

**Spec coverage:**
- POST /api/documents (multipart, Gemini extract, frozen Document) → Task 4 (handler) + Task 2 (extractor). ✓
- GET /api/documents + GET /api/documents/:id from in-memory store → Task 4 + Task 3. ✓
- Store seam with put/get/list → Task 3. ✓
- `@google/genai` extraction, key from `GEMINI_API_KEY` secret, Env type, wrangler docs, no hardcode → Task 2 (call) + Task 5 (Env, wrangler.jsonc, .dev.vars). ✓
- Model string + schema-passing format verified against installed SDK (`gemini-3.5-flash`, Google `Schema`/`Type` enum, Zod for validation) → Global Constraints + Task 2. ✓
- `extractW2(file)` standalone module, temperature 0 → Task 2 (note: necessary `apiKey` second param documented). ✓
- Verbatim prompt / schema / W2_FIELDS → embedded verbatim in Task 2. ✓
- Join: map W2_FIELDS, value === originalValue, status tiers → Task 2 `buildW2Document`. ✓
- Build Document (id, filename from upload, formType, fileUrl placeholder=data URL, reviewedAt null) → Task 2 (base) + Task 4 (filename/fileUrl overwrite). ✓
- Mime allow-list + 415 (incl. HEIC) → Task 4. ✓
- Inline base64 + mimeType to Gemini, single page → Task 2. ✓
- try/catch → failed Document with error, never throw → Task 2 + optional `error?` field (Task 2 Step 2). ✓
- Tests: join (all tiers) + mime rejection, mocked SDK, no live API → Task 2 + Task 4. ✓
- Out of scope items left as seams → store untouched by persistence, no context wiring, single page. ✓

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the prompt is embedded in full. ✓

**Type consistency:** `extractW2(file, apiKey)`, `buildW2Document(parsed)`, `handleApi(request, env)`, `store.put/get/list/clear`, `toBase64`/`toDataUrl` are referenced with identical signatures across tasks. `W2Extraction` is both a value (schema) and exported type. `Document.error?` added before first use. ✓

**Known live-only caveat (not a test gap):** the exact model string `gemini-3.5-flash` is passed straight through to the API; the SDK does not validate it locally and tests mock the client, so model availability is the one thing only a live key confirms. If the API 404s on the model, change the single `MODEL` constant in `src/extract/w2.ts`.
