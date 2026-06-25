# Stateless Extraction + Client-Owned State, Design

**Date:** 2026-06-24
**Status:** Approved
**Supersedes:** the R2/D1 persistence proposal (never implemented; nothing R2/D1 exists to remove). The only server state to delete is the original in-memory store.

## Goal

Pivot the app so the Worker is a stateless extraction endpoint (file in, extraction result out, stores nothing) and all document state lives in the browser. This removes the multi-isolate "GET after POST 404" problem and deletes the persistence layer entirely.

## Why

The demo holds about 5 sample documents plus whatever the reviewer uploads in one session. Nothing durable, nothing concurrent. So the server should hold no state.

## Global constraints (bind every task)

1. **No em dash.** Never use an em dash or en dash in any artifact (code, copy, comments, fixtures, commit messages, docs). Use a comma. For ranges write "0 to 100".
2. **Failed-path copy is exact:** `Detected {type}, not a legible W-2.` where `{type}` is `detectedFormType`. One source of this string (the shared merge helper, below).
3. **ExtractionResult is the server contract:** `{ fields: Field[]; status: DocStatus; detectedFormType: string; error?: string }`. `Document` and `Field` stay frozen; `ExtractionResult` is added to `src/types.ts`. The server never fabricates `id`, `filename`, or `fileUrl`.
4. **Single shape source.** Captured fixtures must be byte-identical in shape to production output. The capture script calls the same `extractW2` / `buildW2Document` path as production. No parallel transform in the script.
5. **bbox normalization lives inside `buildW2Document`.** It is the one place any bbox conversion would go (for example, if a live capture later shows Gemini emits 0 to 1000 coordinates or corner coordinates rather than 0 to 100 x/y/w/h). Today it is an identity pass-through; do not build a conversion now and do not block on knowing Gemini's native bbox format. The fixture shape is fixed at 0 to 100 x/y/w/h regardless, so the harness stays valid whether or not that conversion is later needed.
6. **Two kinds of JSON, kept separate.** (a) Seed/fixture JSON is a post-build `ExtractionResult` in the final target shape (bboxes as 0 to 100 x/y/w/h); the harness builds and verifies against it; tests mock the Gemini SDK and verify plumbing (the join, status tiers, the provisional-to-merged flow, context behavior), not extraction accuracy. (b) The capture run (`scripts/capture-fixtures.ts`) hits the live Gemini API and is the accuracy check; it is a standalone manual script the user runs locally with `GEMINI_API_KEY`, never part of the green-on-every-commit suite.
7. **Field keys are the production keys.** Fixtures now carry the `W2_FIELDS` keys (`federalWithholding`, `socialSecurityWages`), because they come through the production path, not the old front-end `W2_FIELD_TEMPLATE` keys (`fedWithholding`, `ssWages`). The UI keys `field.key` opaquely, so this is safe; only fixture-referencing tests and the CSV export column reflect it.

## Architecture (the five sections of the approved design)

### Section 1: Server, stateless extraction endpoint

- **`src/types.ts`:** add `ExtractionResult` (additive). `Document`/`Field` unchanged.
- **`src/extract/w2.ts`:** `extractW2(file, apiKey)` returns `Promise<ExtractionResult>`. Drop the fabricated `base` object. Success returns `{ fields, status, detectedFormType: parsed.detectedFormType }` (read straight from the validated parse). The catch path returns `{ fields: [], status: 'failed', detectedFormType: 'unknown', error }` and never throws. `buildW2Document` is unchanged in behavior and remains the bbox-normalization seam (constraint 5); add a short comment marking it as that seam (currently identity).
- **`src/api/documents.ts`:** `handlePostDocument(request, apiKey)` runs the mime gate, reads bytes, calls `extractW2`, and returns the `ExtractionResult` as JSON (200). It stores nothing and sets no `filename`/`fileUrl`. Delete `handleGetDocuments` and `handleGetDocument`, the `store` import, and the `toDataUrl` import.
- **`src/api/router.ts`:** `handleApi(request, env)` routes only `POST /api/documents` to `handlePostDocument`; 405 for other methods on that path, 404 for any other path. `env` stays `{ GEMINI_API_KEY: string }`.
- **`src/worker.ts`:** unchanged (`Env` is already `{ ASSETS, GEMINI_API_KEY }`; it never gained bindings).
- **Delete** `src/documents/store.ts`.
- **`src/lib/bytes.ts`:** remove `toDataUrl`. Keep `toBase64` and `toUint8` (the extractor still uses them).
- **415 mime gate unchanged:** allow `application/pdf`, `image/png`, `image/jpeg`; reject everything else (including HEIC) with a clear 415.

### Section 2: Shared merge helper

A pure helper assembles a final `Document` from upload/fixture metadata plus an `ExtractionResult`, used by both the client merge and `fixtures.ts`, so the failed-message copy and the merge live in one place.

```ts
// src/lib/applyExtraction.ts
import type { Document, ExtractionResult } from '../types'

export type DocumentBase = Pick<Document, 'id' | 'filename' | 'fileUrl' | 'reviewedAt'>

export function applyExtraction(base: DocumentBase, result: ExtractionResult): Document {
  const derivedError =
    result.status === 'failed'
      ? result.error ?? `Detected ${result.detectedFormType}, not a legible W-2.`
      : result.error
  return {
    ...base,
    formType: 'W-2',
    status: result.status,
    fields: result.fields,
    ...(derivedError ? { error: derivedError } : {}),
  }
}
```

### Section 3: Client, `DocumentsContext` owns state

`addDocuments(files)` is rewritten. Per file:
- **a.** Build a provisional `Document`: `id = crypto.randomUUID()`, `filename = file.name`, `formType: 'W-2'`, `status: 'processing'`, `fileUrl = URL.createObjectURL(file)`, `fields: []`, `reviewedAt: null`. Prepend it to the list (drives the existing processing-to-final UI flip).
- **b.** `POST` the file as `FormData` to `/api/documents` and await the `ExtractionResult`.
- **c.** On a 2xx response, merge via `applyExtraction(base, result)` where `base` keeps the client `id`, `filename`, `fileUrl`, `reviewedAt`. On a non-2xx response or a network error, merge a synthesized failed result `{ fields: [], status: 'failed', detectedFormType: 'unknown', error: <message> }` (so the failed UI shows a reason).

Remove the `setTimeout` simulation, `seqRef`, and the `W2_FIELD_TEMPLATE` import. **Object-URL lifecycle:** track created blob URLs in a ref and call `URL.revokeObjectURL` for each on provider unmount (this replaces the old timer cleanup). `updateField`, `markReviewed`, and `getDocument` stay client-only. This extraction POST is the only API call in the app; no PATCH endpoint.

### Section 4: Sample fixtures (the five instant-load demo docs)

Bundled and static, with no live Gemini call at demo time.

```
src/assets/              bundled W-2 sample image(s); keep existing w2-sample.png; user adds others (incl. a non-W-2 for the failed sample)
src/fixtures/*.json      one captured ExtractionResult per sample, committed (final shape)
src/fixtures.ts          assembles the five demo Documents from imported image asset(s) + the JSON via applyExtraction
scripts/capture-fixtures.ts  runs extractW2 on the sample assets, writes src/fixtures/*.json
```

- Each demo `Document` uses a stable id, a filename, `fileUrl` = the imported asset path (not an object URL), and (for `ready` ones) a fixed `reviewedAt` ISO string. `fields`/`status`/`error` come from the seed/captured `ExtractionResult` through `applyExtraction`.
- **Status variety** comes from the committed seeds: at least one `ready`, one `needs_review` (a field with confidence under 0.7), and one `failed` (a non-W-2 seed with `detectedFormType` set and empty fields, which `applyExtraction` turns into the `Detected {type}, not a legible W-2.` message). The five replace the current set (drop the permanent `processing` fixture; a settled demo has no in-flight doc). Seed field values and bboxes reuse the current realistic, PNG-calibrated fixture data, remapped to the production keys (constraint 7).
- **Seed-then-capture:** seeds are committed now in the final post-build shape so every commit is green with full status variety. The capture run later overwrites them with authentic field values, confidences, and bboxes. If a capture changes an intended status, the user adjusts the source image or value (allowed); the seed-authored variety is what the harness depends on.
- **Capture script:** reads each sample asset's bytes, derives the mime from the extension, calls `extractW2(bytes, mimeType, apiKey)` (constraint 4: the production path), and writes `JSON.stringify(result)` to `src/fixtures/<name>.json`. It does no transform of its own. It is run via a new `npm run capture-fixtures` script backed by `vite-node` (added as a dev dependency so it resolves the project's extensionless TS imports and `vite.config.ts`). The user runs `GEMINI_API_KEY=... npm run capture-fixtures`.

### Section 5: Tests (plain Vitest, existing style, run locally by the user)

- **Remove** the store tests and both GET-handler tests.
- **Server POST test:** asserts `POST /api/documents` returns an `ExtractionResult` and stores nothing (SDK mocked). **Keep** the 415 mime-gate test and the graceful-failure assertion (status `failed` + error, never throws).
- **Keep** the `buildW2Document` join and status-tier tests (failed / needs_review / ready) and the bytes tests (minus the `toDataUrl` test).
- **New `applyExtraction` test:** ready/needs_review pass through; failed with no server error derives the exact copy; client `id`/`fileUrl`/`reviewedAt` preserved.
- **New `DocumentsContext` test** (mock `fetch`, stub `URL.createObjectURL` and `URL.revokeObjectURL` since jsdom does not implement them): upload creates a provisional `processing` doc, then resolves to the extracted `fields`/`status`; the client `id` and `fileUrl` are preserved across the merge; a non-2xx or network error flips the doc to `failed`. Update existing context tests that reference the old fixture ids to the new ones.

## Out of scope (noted, not built)

PDF rendering in the `<img>` viewer (the happy path stays PNG/JPG image-only), Review next/prev navigation, auth, and IndexedDB persistence across refresh.
