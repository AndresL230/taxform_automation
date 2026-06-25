# Form registry and 1099-NEC support, design

Date: 2026-06-25

## Goal

Add 1099-NEC as a second supported form type, and in doing so refactor the
extraction pipeline from W-2-hardcoded into a **form registry** so that further
forms become configuration, not plumbing. Three outcomes define done:

1. W-2 keeps working identically (proven by unchanged unit tests plus the live eval).
2. 1099-NEC works at the same quality bar (same anti-hallucination and value-format rules).
3. Adding form #3 later is a registry entry (fieldDefs + promptFragment), not new code.

## Current architecture (what we are generalizing)

Production extraction lives in `src/extract/w2.ts` and is W-2-hardcoded:

- `W2_FIELDS`: the backend join constants (`key`, `box`, `label`, `type`).
- `W2Extraction`: a Zod schema and its inferred type (validation).
- `RESPONSE_SCHEMA`: the Google/Gemini response schema.
- `PROMPT`: one big prompt, mixing shared rules with the W-2 field list.
- `buildW2Document(parsed)`: joins model output with the constants and assigns status.
- `extractW2(file, apiKey)`: one Gemini call that classifies and extracts together.

Flow: `api/router.ts` -> `api/documents.ts` (415 gate, stateless POST) ->
`extractW2` -> `ExtractionResult`. The client `lib/applyExtraction.ts` attaches
document identity, hardcodes `formType: 'W-2'`, and derives the failed message
`Detected {type}, not a legible W-2.`. `DocumentsContext` sets a provisional
`formType: 'W-2'`. The review UI (`FormTypeBadge`, `FieldRow`, `Review`) is mostly
form-agnostic and renders whatever `Field[]` and `formType` string it is given.

## The form registry (core refactor)

### Types

```ts
export type FieldDef = { key: string; box: string; label: string; type: FieldType }

// Generic, validated model output shared by every form.
export type Extracted = { value: string; confidence: number; bbox: BBox }
export type ParsedExtraction = { isLegible: boolean; fields: Record<string, Extracted> }

export type FormDefinition = {
  formType: string                       // canonical, e.g. 'W-2', '1099-NEC'
  fieldDefs: readonly FieldDef[]         // today's W2_FIELDS, generalized
  responseSchema: Schema                 // Gemini response schema for the extract call
  validate: (raw: unknown) => ParsedExtraction  // Zod-backed parse, throws on invalid
  promptFragment: string                 // the FIELDS-TO-EXTRACT block + form-specific rules
}
```

This matches the task's four-field shape (`formType`, `fieldDefs`,
`responseSchema`, `promptFragment`) plus one addition: `validate`. The task says to
move "the W2Extraction schema" into the entry; that schema is the Zod validator, so
each entry owns both the Gemini-facing `responseSchema` and the validating
`validate`. Both are generated from the field keys by a shared helper, so a new
entry supplies only fieldDefs and a promptFragment.

### Shared schema builder (COMMON)

`src/extract/build.ts` provides the shared per-field `Extracted` Zod schema and
Google `extractedSchema`, plus a builder that turns a list of field keys into both
schemas for a form:

```ts
buildFormSchemas(fieldKeys: string[]): {
  responseSchema: Schema                  // { isLegible, fields: { <key>: extractedSchema ... } }
  validate: (raw: unknown) => ParsedExtraction
}
```

The extract response shape is uniform across forms: `{ isLegible: boolean, fields: {
<key>: { value, confidence, bbox } } }`. Numeric min/max/int constraints stay on the
Zod side (as today); the Google schema omits them.

### buildDocument (COMMON, generalized buildW2Document)

```ts
export function buildDocument(
  parsed: ParsedExtraction,
  formDef: FormDefinition,
): { fields: Field[]; status: DocStatus }
```

The join and status logic are **identical** to today's `buildW2Document`, only
driven by `formDef.fieldDefs` instead of the `W2_FIELDS` constant:

- Map each `fieldDef` to a `Field`, copying `value` into `originalValue`.
- bbox normalization seam stays here (identity pass-through today, 0 to 100), shared
  by all forms.
- Status rules UNCHANGED: `!isLegible` -> `failed`; any empty value or
  `confidence < 0.7` -> `needs_review`; else `ready`.

### Prompt scaffold (COMMON) + fragment (per form)

`src/extract/prompt.ts` holds the shared scaffold and assembles the extract prompt:

```ts
buildExtractPrompt(formDef: FormDefinition): string
```

The scaffold keeps the COMMON pieces: precise-engine intro (parameterized by
`formDef.formType`), the core anti-hallucination rules (never guess, transcribe
exactly, do not reconstruct masked digits), the `isLegible` instruction
(parameterized by form type), VALUE FORMATTING (currency / SSN / EIN / text),
CONFIDENCE tiers, and the BOUNDING BOXES convention. Only the FIELDS-TO-EXTRACT
block and any form-specific disambiguation come from `formDef.promptFragment`,
spliced into the FIELDS section. The W-2 extract prompt produced this way is
content-equivalent to today's `PROMPT` (same rules, same field list), minus the
classification instruction, which moves to the classify call.

### Module layout

```
src/extract/
  build.ts       COMMON: Extracted schema, buildFormSchemas, buildDocument, ParsedExtraction
  prompt.ts      COMMON: scaffold, buildExtractPrompt, classify prompt + schema + Zod
  registry.ts    FormDefinition, FieldDef, FORM_REGISTRY, getFormDefinition, normalizeFormType
  extract.ts     extractDocument(file, apiKey): classify -> route -> extract -> build
  w2.ts          W-2 entry: W2_FIELDS, W2_FORM, plus W2Extraction + buildW2Document (legacy adapter)
  nec.ts         1099-NEC entry: NEC_FIELDS, NEC_FORM
```

`registry.ts` exposes `FORM_REGISTRY: Record<string, FormDefinition>` keyed by
canonical form type, `getFormDefinition(type)` (normalizing lookup), and
`supportedFormTypes`. Adding form #3 means: create `src/extract/<form>.ts` with its
fieldDefs + promptFragment, register it. No edits to build/prompt/extract.

### W-2 entry and the unchanged tests

Production W-2 extraction is uniform with every other form: `W2_FORM` uses the
COMMON scaffold + a W-2 promptFragment and the generic `{ isLegible, fields }`
schema from `buildFormSchemas`. There is no bespoke W-2 schema in the production
path; this fully realizes "the scaffold stays COMMON, only FIELDS come from the
fragment" for W-2 too.

To keep `src/extract/w2.test.ts` literally UNCHANGED, `src/extract/w2.ts` also keeps
exporting `W2_FIELDS`, the legacy `W2Extraction` type (shape `{ detectedFormType,
isLegibleW2, fields }`), and `buildW2Document`. These are a thin
**regression-proving adapter** over the generic path, used only by the test:

```ts
export function buildW2Document(parsed: W2Extraction) {
  return buildDocument({ isLegible: parsed.isLegibleW2, fields: parsed.fields }, W2_FORM)
}
```

The test continues to exercise and prove the generic join produces identical W-2
output. `W2Extraction`/`buildW2Document` are legacy-test-only; production uses
`W2_FORM`.

## Classification (the genuinely new piece)

**Recommendation: (a) a cheap first-pass classify call, then extract with the
detected form's definition.** Reasoning:

- **Reliability.** Each extract call uses the exact per-form schema and prompt. The
  model is never asked to simultaneously decide the form and fill a superset of
  fields. Option (b) single-call needs a union schema (every form's fields in one
  object) or a guessed schema, which is fragile and harder to validate.
- **Registry cleanliness.** The classify call's allowed-type hint is derived from
  registry keys. Adding form #3 needs no change to a shared union schema, because
  there is none. This directly serves "form #3 is config, not code".
- **Mismatch is structurally avoided.** Classify is the single source of truth for
  the type; we extract as exactly that type, so there is no second detection to
  disagree. The task's "on mismatch, prefer the detected type" is satisfied by
  construction.
- **Cost/latency tradeoff, accepted.** Two sequential Gemini calls add latency, and
  a small classify cost. The classify call is tiny (returns one short string). For a
  correctness-critical tax tool, precise per-form extraction outweighs one extra
  round trip. Noted as the explicit tradeoff.

### extractDocument

```ts
export async function extractDocument(
  file: { bytes: ArrayBuffer | Uint8Array; mimeType: string },
  apiKey: string,
): Promise<ExtractionResult>
```

1. Classify: one Gemini call, schema `{ detectedFormType: string }`, prompt asks
   only "which US tax form is this". Normalize the answer (`normalizeFormType`:
   `w-2`/`W2` -> `W-2`, `1099 nec`/`1099-nec` -> `1099-NEC`, else the raw string).
2. Route: `getFormDefinition(detected)`.
   - Not in registry -> `{ fields: [], status: 'failed', detectedFormType: detected,
     error: 'Detected {detected}, not a supported form.' }`. (comma, no dash; repo rule)
3. Extract: one Gemini call with `formDef.responseSchema` and
   `buildExtractPrompt(formDef)`. Validate with `formDef.validate`.
4. Build: `buildDocument(parsed, formDef)`.
   - If status is `failed` (not legible), set
     `error: 'Detected {formType}, could not extract it reliably.'`.
5. Return `{ fields, status, detectedFormType: formDef.formType, error? }`.
6. Any thrown error -> `{ fields: [], status: 'failed', detectedFormType: 'unknown',
   error }` (unchanged catch behavior).

The extraction layer now owns all failed-path messages (server-authoritative),
which lets the client mapping shed its W-2-specific message derivation.

## 1099-NEC definition

Box numbers and labels confirmed against the current IRS Form 1099-NEC (Rev.
January 2024, used for tax years 2024 and 2025): Box 1 "Nonemployee compensation";
Box 2 is a checkbox (direct sales), not a dollar amount; Box 3 is reserved; Box 4
"Federal income tax withheld"; Boxes 5 to 7 are state fields. Payer and recipient
identity fields (PAYER'S name, PAYER'S TIN, RECIPIENT'S TIN, RECIPIENT'S name) are
labeled regions on the form, not numbered boxes.

`NEC_FIELDS` (drives both the join and, via keys, the schemas):

| key | box | label | type |
| --- | --- | --- | --- |
| nonemployeeCompensation | 1 | Nonemployee compensation | currency |
| federalWithholding | 4 | Federal income tax withheld | currency |
| payerTIN | (none) | Payer's TIN | ein |
| recipientTIN | (none) | Recipient's TIN | ssn |
| payerName | (none) | Payer's name | text |
| recipientName | (none) | Recipient's name | text |

- `box` is `''` for the four unboxed identity fields (the IRS form does not number
  them). `FieldRow` is adjusted to hide the "Box ..." sub-label when `box` is empty.
- `type` reuses the existing `FieldType` set, so normalization and the eval scorer
  work unchanged: `payerTIN` -> `ein` (payer is typically a business EIN),
  `recipientTIN` -> `ssn` (recipient is typically an individual). No new `FieldType`
  is added. A recipient that is a business carries an EIN-format TIN; we transcribe
  as printed and accept that `ssn`-typed normalization may not reformat an EIN
  exactly. This is a known, narrow limitation (TIN polymorphism), out of scope here.

`promptFragment` (the FIELDS block + NEC disambiguation), same value-format and
anti-hallucination rules as W-2 via the COMMON scaffold:

```
FIELDS TO EXTRACT (1099-NEC):
- nonemployeeCompensation: Box 1, "Nonemployee compensation". Currency.
- federalWithholding: Box 4, "Federal income tax withheld". Currency.
- payerTIN: the PAYER'S TIN. Usually an EIN, format ##-####### as printed.
- recipientTIN: the RECIPIENT'S TIN. Usually an SSN, format ###-##-#### as printed.
  Preserve any masking.
- payerName: the PAYER'S name as printed (name only, not address).
- recipientName: the RECIPIENT'S name as printed (name only, not address).
Form-specific notes: a 1099-NEC reports contractor (nonemployee) income. Box 1 is
nonemployee compensation; do not confuse it with Box 7 state income. Federal income
tax withheld is Box 4 (Box 2 is a checkbox, not a dollar amount).
```

## UI and types

### Frozen-type change (flagged, as requested)

`Document.formType: 'W-2'` must widen. **Change: `formType: string`.** Justification:
we now support multiple forms; a failed or unsupported document must display its
detected type (for example "1098"); the provisional/processing state has no type
yet; and the UI already treats `formType` as an opaque rendered string. A narrow
union (`'W-2' | '1099-NEC'`) cannot represent detected-but-unsupported types or the
provisional state, so `string` is the honest choice. This is the only frozen-type
change; `FieldType` is unchanged.

### Client mapping and components

- `lib/applyExtraction.ts`: drop the hardcoded `formType: 'W-2'` and the
  W-2-specific message derivation. Become a pass-through: `formType:
  result.detectedFormType`, status/fields from the result, and `error` from
  `result.error` (now always set by the server on failed). With a ready W-2 result
  (`detectedFormType: 'W-2'`) this still yields `formType: 'W-2'`.
- `DocumentsContext`: provisional `formType: ''` (unknown until classified; the
  badge fills in when extraction returns). Keep the catch-path failed result.
- `UploadZone`: copy updated from "W-2 forms only for now" to mention both forms,
  for example "W-2 and 1099-NEC supported". Keeps the word "Drag" (test matches `/drag/i`).
- `FieldRow`: render the "Box {box}" sub-label only when `box` is non-empty (NEC
  identity fields have no box). W-2 box values ('1', 'a', ...) still render.
- `FormTypeBadge`, `DocumentTable`, `Review`: already drive off `formType: string`,
  no change.

## Tests

### Unchanged (prove no regression)

- `src/extract/w2.test.ts`: `buildW2Document` join + status + frozen Field shape,
  via the legacy adapter over generic `buildDocument`.
- `src/worker.test.ts`: routing.
- eval `normalize.test.ts`, `score.test.ts`, `groundtruth.test.ts` (W-2 ground
  truth kept in place; see Eval).

### New

- `src/extract/build.test.ts` (or `nec.test.ts`): `buildDocument` with a mocked NEC
  `ParsedExtraction` -> valid `Field[]` in the frozen shape (6 fields), status tiers
  correct (ready / needs_review on empty or low confidence / failed on `!isLegible`).
- `src/extract/extract.test.ts` (node env, mocked SDK): classification routing. The
  mock branches on prompt text (classify vs extract). W-2 detection routes to the
  W-2 def and returns 7 fields; NEC detection routes to the NEC def and returns 6
  fields; an unsupported type ('1098') returns `failed` with `error: 'Detected 1098,
  not a supported form.'` and never makes the extract call.

### Kept, with a one-line mock-fixture update

- `src/api/documents.test.ts` (the 415 gate + stateless-POST tests): all assertions
  unchanged (200 / `ready` / 7 fields / `detectedFormType: 'W-2'` / no id, filename,
  fileUrl; 415; 400; 405). Because production now standardizes on the generic
  `isLegible` key, the mock's `FAKE` payload renames `isLegibleW2` to `isLegible`
  (and keeps `detectedFormType: 'W-2'` for the classify call). One FAKE validates
  both the classify schema and the W-2 extract schema (Zod ignores extra keys). This
  is a mock-fixture change, not a behavior or assertion change.

### Updated (justified, not a W-2 regression)

- `src/lib/applyExtraction.test.ts` #4: the old assertion "failed without a server
  error derives 'Detected 1099-NEC, not a legible W-2.'" is now wrong on two counts
  (1099-NEC is supported; the client no longer derives messages). Replace with: a
  failed result carries the server's error through, and `formType` reflects
  `detectedFormType` (for example an unsupported '1098' with its server error).
- `src/fixtures.test.ts`: it currently asserts the failed doc is a 1099-NEC with the
  old message, and that every ready doc has exactly 7 fields. Both break once NEC is
  supported and a NEC fixture is added. Update to be form-aware: W-2 ready docs have
  7 fields, NEC ready docs have 6; the failed demo doc is an unsupported form with
  the new "not a supported form" message; document count reflects the added NEC
  fixtures.

## Fixtures and eval (seed now, user runs live later)

### Seed fixtures

- Add 1099-NEC seed fixture(s) in `src/fixtures/` as post-build `ExtractionResult`
  JSON (status `ready`, `detectedFormType: '1099-NEC'`, 6 NEC fields), wired into
  `src/fixtures.ts` so the demo shows both form types. `fileUrl` reuses the existing
  sample asset (placeholder; the user overwrites via capture).
- Repoint the failed demo doc: `src/fixtures/scan.json` currently is a 1099-NEC
  (was failed only because NEC was unsupported). Change it to a genuinely
  unsupported form, `detectedFormType: '1098'`, `status: 'failed'`, with
  `error: 'Detected 1098, not a supported form.'`, so the demo still shows a failed
  state and now exercises the unsupported-form path.

### Capture script

`scripts/capture-fixtures.ts`: call `extractDocument` (the new production path) so
captured fixtures stay byte-identical to server output. Add a `form` label to each
SAMPLES entry (for out-naming and intent) and a commented NEC sample entry the user
fills in with their asset.

### Eval harness (form-parameterized scaffold)

The image-degradation axes and the scorer are already form-agnostic. Parameterize
by form type without regressing W-2:

- Keep `scripts/eval/groundtruth.ts` as the W-2 ground-truth module (so
  `groundtruth.test.ts` stays green). Add `scripts/eval/groundtruth-nec.ts` with NEC
  scenarios, NEC `FormData`, and NEC ground truth (obvious-fake TINs, currency
  comma/strip cases, masked-TIN case, blank-Box-4 case).
- Add `scripts/eval/forms.ts`: an `EvalForm` config per form type
  (`formType`, PDF asset filename, AcroForm `fieldMap`, `scoredKeys`,
  `scenarios`, `makeScenario`, and a form-specific `substituteStyle` renderer for
  the substitute-layout variant). W-2 config wraps the existing logic; NEC config is
  new (with the `f1099nec.pdf` field map as a best-guess to reconcile via
  `DUMP_FIELDS`, since the asset is the user's to supply).
- Generalize `make-w2.ts` -> a form-driven make step, and `run.ts` to select the
  form via `FORM=W-2` (default) or `FORM=1099-NEC`, generating that form's variants,
  running them through `extractDocument`, and scoring against that form's ground
  truth. Default `npm run eval:run` behaves identically to today (W-2).
- Update `scripts/eval/README.md` for the `FORM=` switch and the 1099-NEC asset
  (`scripts/eval/assets/f1099nec.pdf`).

This is scaffold-only for NEC: the user supplies the live key and the
`f1099nec.pdf` asset and runs make + degrade + score.

## Out of scope

- Forms beyond 1099-NEC. The next registry entries (config, not code) are
  **1099-INT** and **1099-DIV**: each is a `src/extract/<form>.ts` with fieldDefs +
  promptFragment, registered, plus optional eval config.
- 1099-B composites and Schedule K-1 (the hard tier) are explicitly deferred.
- PDF rendering in the document viewer (F1) and auth.

## Decisions log

- Classification: option (a), cheap classify then per-form extract. Reliability and
  registry cleanliness over one round trip.
- `FormDefinition` gains a `validate` member beyond the task's four fields, to own
  Zod validation alongside the Gemini `responseSchema`.
- `Document.formType` widened to `string` (the one frozen-type change), justified above.
- Failed-path messages move server-side (extraction layer), so the client mapping is
  a pure pass-through and carries no form-specific copy.
- `buildW2Document` + `W2Extraction` retained as a regression-proving adapter so the
  W-2 unit test is literally unchanged.
