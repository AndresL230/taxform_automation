# W-2 Extraction in the Worker — Design

**Date:** 2026-06-24
**Status:** Approved
**Scope:** Implement real W-2 extraction behind `/api/documents` in the Cloudflare Worker, returning the frozen `Document` shape. Persistence, context-wiring, multi-page, other form types, and auth are explicitly out of scope.

## Goal

`POST /api/documents` receives an uploaded file (PDF, PNG, or JPEG), runs Gemini extraction, and returns a `Document` in the frozen shape from `src/types.ts`. `GET /api/documents` and `GET /api/documents/:id` read from an in-memory store. The store is a thin seam so R2/D1 can be swapped in later without touching the handlers.

## Resolved decisions

These three points were ambiguous or in tension with the existing code; resolutions are fixed for this work:

1. **`fileUrl` placeholder → inline `data:` URL.** The returned `Document.fileUrl` is a `data:<mime>;base64,...` URL of the uploaded bytes, so the uploaded document renders in the Review viewer immediately. This stays a thin seam: the storage step replaces it with an R2 object URL.
2. **Field keys → spec verbatim.** The extractor emits `federalWithholding` / `socialSecurityWages` exactly as the spec's `W2_FIELDS` defines, even though the seeded `fixtures.ts` uses `fedWithholding` / `ssWages`. This is UI-safe: the UI treats `field.key` opaquely (React list key, internal selection/update matching, and a CSV export column) and hardcodes none of these strings. Only the CSV export column reflects the new names.
3. **Error field → add optional `error?: string` to `Document`.** The frozen type has no error field and models failure as `status: 'failed'` + `fields: []`. Adding `error?: string` is backward-compatible: every existing `Document`/fixture still type-checks (optional), and no UI component reads it. Failed Documents carry the failure reason inline, so it survives `GET` and the later `DocumentsContext` wiring. This is the only change to the frozen file.

## Architecture

```
src/
  types.ts            # + optional `error?: string` on Document (only frozen-file change)
  worker.ts           # + Env.GEMINI_API_KEY; route /api/* → handleApi, else ASSETS.fetch
  api/
    router.ts         # handleApi(request, env): matches the 3 routes → Response; 404/405/415
    documents.ts      # the 3 route handlers; owns multipart parsing + mime gate
  documents/
    store.ts          # in-memory seam: put / get / list over a module-level Map<string, Document>
  extract/
    w2.ts             # verbatim prompt + W2Extraction schema + W2_FIELDS; extractW2 + pure join
```

**Seam discipline:** handlers only call `store.put` / `store.get` / `store.list`, never touching the `Map`. Swapping to R2/D1 later is a single-module change.

## `src/extract/w2.ts`

Contains the three verbatim pieces from the spec — the extraction prompt text, the `W2Extraction` Zod schema, and the `W2_FIELDS` backend-join constant — used exactly as given (see Appendix). Two exports:

- **`buildW2Document(parsed: W2Extraction): { fields: Field[]; status: DocStatus }`** — pure function. Maps `W2_FIELDS` over `parsed.fields`; for each field sets **both** `value` and `originalValue` to the extracted value (so the UI's "edited" marker works on first correction), copies `confidence` and `bbox`, and carries `label`/`box`/`type` from `W2_FIELDS`. Computes status:
  - `!parsed.isLegibleW2` → `"failed"`
  - else any field `value === "" || confidence < 0.7` → `"needs_review"`
  - else → `"ready"`

  `buildW2Document` **always** maps all seven fields from `parsed.fields`, then computes status — it does not empty the fields when status is `failed`. So a clean parse of a non-W-2 (`isLegibleW2: false`) yields `status: 'failed'` with the seven mapped fields (typically empty strings / low confidence as the model returned them) and **no** `error` string. The `fields: []` + `error` case arises only from the `extractW2` try/catch path below. This is the unit the join test drives directly with mocked `W2Extraction` objects.

- **`extractW2({ bytes, mimeType }): Promise<Document>`** — base64-encodes `bytes`, calls Gemini with temperature 0 (transcription, not generation): the prompt text plus the file as an inline base64 part with its `mimeType`, requesting JSON constrained to the response schema. Then `JSON.parse` + Zod-validate → `W2Extraction`, and calls `buildW2Document`. Assembles the `Document`: `id` via `crypto.randomUUID()`, `formType: 'W-2'`, `reviewedAt: null`, and **placeholder** `filename: ''` / `fileUrl: ''` (the POST handler overwrites these from the upload, since the signature receives only bytes + mime).

  **Error handling:** the Gemini call and the parse/validate are wrapped in try/catch. On any model error or schema-validation failure it returns a `Document` with `status: 'failed'`, `fields: []`, and `error: <clear message>` — it never throws, so the UI degrades gracefully.

## Gemini SDK — verify-then-pin

`@google/genai`, `zod`, and `zod-to-json-schema` are **not installed**. Before writing the call:

1. `npm install @google/genai zod zod-to-json-schema`.
2. Read the **installed** version's types to pin:
   - **Model string** — spec says `gemini-3.5-flash`; confirm against the installed SDK and adjust only if that version names it differently.
   - **Response-schema format** — the installed `@google/genai` may want a Google `Type`-enum `Schema`, a raw JSON Schema, or a Zod object. The schema **content** is fixed by the spec; only the passing format adapts (e.g. `zod-to-json-schema` if JSON Schema is required).

Expected call shape (final form pinned after the version check):

```ts
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
ai.models.generateContent({
  model,
  contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType, data: base64 } }] }],
  config: { temperature: 0, responseMimeType: 'application/json', responseSchema },
})
```

**Config / secret:** `GEMINI_API_KEY` is a wrangler secret, added to the `Env` type. It is never hardcoded. `wrangler.jsonc` gets a doc note for the secret (`wrangler secret put GEMINI_API_KEY`); no key value committed.

## `src/api/` — routing & input handling

- `worker.ts`: `if (url.pathname.startsWith('/api/')) return handleApi(request, env)`; everything else still falls through to `env.ASSETS.fetch(request)`. `Env` gains `GEMINI_API_KEY: string`.
- **POST `/api/documents`**: parse `multipart/form-data`, pull the uploaded `File`.
  - **Mime gate:** allow only `application/pdf`, `image/png`, `image/jpeg`. Anything else (including HEIC) → **415** with a clear message. This gate lives in the handler; `extractW2` trusts its already-validated input.
  - Read bytes → `extractW2({ bytes, mimeType })` → overwrite the returned Document's `filename` (from `File.name`) and `fileUrl` (a `data:` URL of the bytes) → `store.put` → respond with the `Document`. When `status === 'failed'`, the response still returns 200 with the failed Document (graceful degrade); the `error` is on the Document.
- **GET `/api/documents`** → `store.list()`.
- **GET `/api/documents/:id`** → `store.get(id)`, or **404** if absent.
- Unknown `/api/*` path → 404; unsupported method on a known path → 405.

## `src/documents/store.ts`

Module-level `Map<string, Document>`. Exports `put(doc): void` (keyed by `doc.id`), `get(id): Document | undefined`, `list(): Document[]`. No persistence — explicitly the seam that the later R2/D1 step replaces. In-memory state resets on Worker restart, which is acceptable for this step.

## Testing — plain Vitest, mocked SDK

Matches the existing style (`globals: true`, jsdom, `src/test/setup.ts`); the Gemini SDK is mocked, **no live API calls**.

- **Join test** (`src/extract/w2.test.ts`): drive `buildW2Document` with mocked `W2Extraction` objects. Assert the result is a valid `Field[]` in the frozen shape, `originalValue === value` for each field, and the correct status for each tier:
  - legible + all confident, non-empty → `ready`
  - legible + some field empty or `confidence < 0.7` → `needs_review`
  - `isLegibleW2: false` → `failed`
- **Mime-rejection test**: POST a disallowed type (e.g. `image/heic`) to the handler → assert **415**. `@google/genai` mocked via `vi.mock`.

## Out of scope (seams left intact)

R2/D1 persistence (store seam stays), `DocumentsContext` fetch-wiring, multi-page documents, form types beyond the `detectedFormType` / `isLegibleW2` detection flag, and auth.

---

## Appendix — verbatim pieces (used exactly as given)

### Response schema (Zod; also reused to validate)

```ts
const BBox = z.object({
  page: z.number().int(),
  x: z.number(), y: z.number(), w: z.number(), h: z.number(), // all % 0–100
});
const Extracted = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: BBox,
});
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
});
```

### Backend join (the model never generates these constants)

```ts
const W2_FIELDS = [
  { key: "wages",               box: "1", label: "Wages, tips, other comp.",     type: "currency" },
  { key: "federalWithholding",  box: "2", label: "Federal income tax withheld",  type: "currency" },
  { key: "socialSecurityWages", box: "3", label: "Social security wages",        type: "currency" },
  { key: "employerEIN",         box: "b", label: "Employer EIN",                 type: "ein" },
  { key: "employeeSSN",         box: "a", label: "Employee SSN",                 type: "ssn" },
  { key: "employeeName",        box: "e", label: "Employee name",                type: "text" },
  { key: "employerName",        box: "c", label: "Employer name",                type: "text" },
] as const;
```

The extraction prompt text is used verbatim from the task spec (the precise data-extraction-engine prompt with core rules, field definitions, value formatting, confidence bands, and bbox instructions). It is not paraphrased.
