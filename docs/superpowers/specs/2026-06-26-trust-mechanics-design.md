# Trust mechanics, design

Date: 2026-06-26

## Goal

Make extraction output *trustworthy to a human reviewer*. Today a document is
"ready" or "needs review" based only on whether the model said a field was legible
and how confident it claimed to be. That is the model grading its own homework. This
increment adds three independent trust signals that do not depend on model
confidence, plus the review-state plumbing a preparer needs to actually resolve a
document:

1. **Cross-checks (Decision 2).** Arithmetic identities the W-2 must satisfy (Box 4
   ~ Box 3 x 6.2%, Box 6 ~ Box 5 x 1.45%) and format checks (SSN, EIN, currency)
   run on our side, independent of the model. A violation is a third, independent
   reason to force `needs_review`.
2. **Per-field review state (Decision 3).** A field is *reviewed* when a human
   confirmed it or edited it. "Mark as reviewed" stops lying (it no longer force
   flips to `ready`); export softly warns when fields are still unreviewed.
3. **Source-highlight grace (Decision 4).** Bounding boxes are unverified production
   output. A value-bearing field whose bbox is out of range degrades to a "source
   not located" state instead of drawing an off-canvas highlight.

Decision 1 (three new W-2 fields) is the prerequisite data for the arithmetic check.

## The contract is extended additively, this one time

The `Document` / `Field` / `ExtractionResult` contract was frozen during parallel
development. This increment **extends it additively**: only new *optional* fields are
added, nothing existing is removed or renamed, and every existing consumer keeps
working unchanged. The additions:

```ts
// src/types.ts
export type ValidationMessage = { fieldKey: string; message: string }

export type Field = {
  // ...all existing keys unchanged...
  confirmed?: boolean              // NEW, optional. Set by confirmField. Absent === not confirmed.
}

export type Document = {
  // ...all existing keys unchanged...
  validationMessages?: ValidationMessage[]   // NEW, optional.
}

export type ExtractionResult = {
  // ...all existing keys unchanged...
  validationMessages?: ValidationMessage[]   // NEW, optional.
}
```

And one optional member on the form definition (Decision 2):

```ts
// src/extract/registry.ts
export type FormDefinition = {
  // ...all existing members unchanged...
  crossChecks?: (fields: Field[]) => ValidationMessage[]   // NEW, optional.
}
```

Because the new `Field`/`Document`/`ExtractionResult` fields are optional, the frozen
shape is preserved: `buildDocument` still emits exactly the eight original `Field`
keys (it never sets `confirmed`), so the `Object.keys(f)` assertions in
`build.test.ts` and `w2.test.ts` stay green. `confirmed` is a client-only concern set
by the review UI.

### This legitimately touches build/extract, and that is fine

The registry's invariant is "**adding a FORM** needs no build/extract changes." This
increment is not adding a form, it is adding a cross-cutting trust layer, so it
*does* edit `build.ts`, `extract.ts`, and `applyExtraction.ts` to thread
`validationMessages` and run `crossChecks`. That does not violate the invariant:
adding form #5 after this still requires only a `src/extract/<form>.ts` entry plus a
registry line (optionally a `crossChecks`).

`crossChecks` is deliberately **distinct from the existing Zod `validate`**.
`validate` parses the raw model JSON into a `ParsedExtraction` (structural). `crossChecks`
runs on the *built* `Field[]` (semantic: arithmetic + format), produces human-facing
messages, and feeds an independent status path.

## Decision 1, W-2 cross-check fields

Add three currency fields to the W-2, in IRS box order (after Box 3), to
`src/extract/w2.ts` in **all three places** the recon flagged:

`W2_FIELDS` (the new entries, inserted after `socialSecurityWages`):

| key | box | label | type |
| --- | --- | --- | --- |
| socialSecurityTaxWithheld | 4 | Social security tax withheld | currency |
| medicareWages | 5 | Medicare wages and tips | currency |
| medicareTaxWithheld | 6 | Medicare tax withheld | currency |

So the new `W2_FIELDS` order (10 fields) is: wages, federalWithholding,
socialSecurityWages, **socialSecurityTaxWithheld, medicareWages,
medicareTaxWithheld**, employerEIN, employeeSSN, employeeName, employerName.

`W2_PROMPT_FRAGMENT` gains three lines after the Box 3 line:

```
- socialSecurityTaxWithheld: Box 4, "Social security tax withheld". Currency.
- medicareWages: Box 5, "Medicare wages and tips". Currency.
- medicareTaxWithheld: Box 6, "Medicare tax withheld". Currency.
```

The legacy `W2Extraction` Zod object (the easy-to-miss one) gains three keys after
`socialSecurityWages`: `socialSecurityTaxWithheld: Extracted, medicareWages:
Extracted, medicareTaxWithheld: Extracted`. This keeps the regression-proving
`buildW2Document` adapter in lockstep with the production field set.

**1099 forms get no new fields.** NEC/INT/DIV field sets are unchanged.

## Decision 2, validation layer (independent of model confidence)

### Shared format checks, `src/extract/checks.ts` (COMMON, new)

A form-agnostic module that other forms reuse:

```ts
export function looksLikeSSN(value: string): boolean   // mask-aware
export function looksLikeEIN(value: string): boolean   // mask-aware
export function looksLikeCurrency(value: string): boolean
export function parseAmount(value: string): number | null
export function formatChecks(fields: Field[]): ValidationMessage[]
```

- **SSN is mask-aware**: `/^[0-9Xx*]{3}-[0-9Xx*]{2}-[0-9Xx*]{4}$/`. So `123-45-6789`
  is valid AND `XXX-XX-1234` is valid (masking is correct, not an error). The
  anti-hallucination prompt rules tell the model to preserve masking, so a masked SSN
  must pass.
- **EIN**: `/^[0-9Xx*]{2}-[0-9Xx*]{7}$/`, mask-aware for the same reason (payer EINs
  on 1099s can arrive masked).
- **currency**: `parseAmount` strips `$`, `,`, and whitespace, then requires
  `/^-?\d+(\.\d+)?$/`; returns the `Number` or `null`. `looksLikeCurrency` is
  `parseAmount(value) !== null`. Accepts `82300.00`, `82,300.00`, `$82,300`, `0.00`.
- **`formatChecks`** iterates fields, skips any field with an **empty value**
  (defensive, empty is handled by the existing empty-value status path), and for a
  non-empty value runs the check matching `field.type`:
  - `ssn` fails -> `{ fieldKey, message: 'Not a valid SSN format (###-##-####).' }`
  - `ein` fails -> `{ fieldKey, message: 'Not a valid EIN format (##-#######).' }`
  - `currency` fails -> `{ fieldKey, message: 'Not a valid dollar amount.' }`
  - `text` -> never checked.

### W-2 cross-checks, `src/extract/w2.ts`

```ts
export function w2CrossChecks(fields: Field[]): ValidationMessage[]
```

Runs `formatChecks(fields)` first, then the two arithmetic identities, appending a
message per violation:

- `socialSecurityTaxWithheld` ~ `socialSecurityWages` x 0.062
- `medicareTaxWithheld` ~ `medicareWages` x 0.0145

Rules:
- **Skip if any operand is empty** (defensive): if either the tax field or its wage
  base has `value === ''`, skip that identity.
- **Skip if either operand fails to parse** as currency (the format check already
  flagged it; do not double-report or divide by a NaN).
- Tolerance: `ARITHMETIC_TOLERANCE = 2.0` dollars. A violation is
  `Math.abs(actual - wage * rate) > 2.0`. Two dollars covers cent-level rounding on
  both the wage base and the computed tax. (Named constant, easy to tune.)
- Messages:
  - `Box 4 social security tax should be about 6.2% of Box 3 social security wages (expected ${exp}, got ${got}).`
  - `Box 6 Medicare tax should be about 1.45% of Box 5 Medicare wages (expected ${exp}, got ${got}).`
  - `exp` is `(wage * rate).toFixed(2)`; `got` is the raw field value.

`W2_FORM.crossChecks = w2CrossChecks`.

### 1099 forms, format checks only

`NEC_FORM`, `INT_FORM`, `DIV_FORM` each set `crossChecks: formatChecks` (no
arithmetic identities, per Decision 2). A malformed payer EIN or recipient SSN on a
1099 therefore yields a validation message and forces `needs_review`. The existing
1099 unit-test values are valid formats, so those tests stay green.

### `buildDocument` widens, third independent OR, `src/extract/build.ts`

```ts
export function buildDocument(
  parsed: ParsedExtraction,
  formDef: { fieldDefs: readonly FieldDef[]; crossChecks?: (fields: Field[]) => ValidationMessage[] },
): { fields: Field[]; status: DocStatus; validationMessages: ValidationMessage[] }
```

- Build `fields` exactly as today (frozen 8-key shape, bbox seam unchanged here, see
  Decision 4 for the seam comment update).
- `const validationMessages = formDef.crossChecks ? formDef.crossChecks(fields) : []`.
- Status, with the violation list as a **third independent OR**, NOT folded into the
  confidence test (independence is the point):

```ts
if (!parsed.isLegible) {
  status = 'failed'
} else if (
  fields.some((f) => f.value === '' || f.confidence < 0.7) ||  // existing two
  validationMessages.length > 0                                 // NEW, independent
) {
  status = 'needs_review'
} else {
  status = 'ready'
}
```

- Return `{ fields, status, validationMessages }`. Existing callers that destructure
  `{ fields, status }` keep working; the extra key is additive.

### Threading through to the Document

- `extract.ts`: `const { fields, status, validationMessages } = buildDocument(...)`,
  and include `...(validationMessages.length ? { validationMessages } : {})` in the
  returned `ExtractionResult` (omit when empty, mirroring how `error` is handled).
- `applyExtraction.ts`: pass it through:
  `...(result.validationMessages ? { validationMessages: result.validationMessages } : {})`.

### Rendering, per-field validation message, `FieldRow`

`FieldRow` gains an optional `validationMessage?: string` prop. When present it
renders a **warning row treatment visually distinct from the amber low-confidence
dot**: a red-family row tint (`bg-flag-bg`) plus the message text in `text-flag`
below the input, with a `!` glyph and `data-testid="field-warning"`. The amber dot
(driven by confidence) is independent and can co-occur. New CSS tokens in
`src/index.css`:

```css
--color-flag: #b4341c;       /* validation text/icon/border, distinct from amber review */
--color-flag-bg: #fdeceb;    /* validation row background */
```

`Review` builds a `fieldKey -> message` map from `doc.validationMessages` and passes
the matching message into each `FieldRow`.

### Known limitation (flagged, not fixed here)

`validationMessages` is an **extraction-time snapshot**. Editing a flagged field in
the UI does not recompute cross-checks (the form's `crossChecks` lives server-side in
the registry, not in the client context). Recompute-on-edit is deferred. Consequence:
the demo's validation-flagged doc (jdoe, below) stays `needs_review` even after the
preparer touches every field; the confidence-only doc (contoso) can be fully resolved
to `ready`. Both paths are intentionally demonstrable.

## Decision 3, per-field review state + reconcile markReviewed

### Derived review helpers, `src/lib/review.ts` (new)

```ts
export function isFieldReviewed(field: Field): boolean
  // field.confirmed === true || field.value !== field.originalValue
  // (confirmed OR edited; mere selection/focus does NOT count)

export function reviewSummary(doc: Document): { total: number; confirmed: number; corrected: number; remaining: number }
  // corrected  = value !== originalValue                       (edited)
  // confirmed  = confirmed === true && value === originalValue (confirmed-unchanged)
  // remaining  = !confirmed && value === originalValue          (neither)
  // total      = fields.length  (= corrected + confirmed + remaining)

export function unreviewedCount(doc: Document): number   // === reviewSummary(doc).remaining
```

### Context action, `confirmField`, `src/state/DocumentsContext.tsx`

`DocumentsContextValue` gains `confirmField(docId: string, key: string): void`,
which sets that field's `confirmed: true` (immutably, mirroring `updateField`).
Editing is already tracked via `value !== originalValue`; confirming is the new
explicit-acknowledgement path.

### `markReviewed` stops force-flipping to ready

Today `markReviewed` both stamps `reviewedAt` AND unconditionally sets
`status: 'ready'`, which can mark a document ready while fields are unreviewed or a
cross-check is failing. New behavior:

```ts
const markReviewed = (docId) =>
  setDocuments(prev => prev.map(d => {
    if (d.id !== docId) return d
    const reviewedAt = new Date().toISOString()                 // always stamped (now meaningful)
    const allResolved = d.fields.every(isFieldReviewed)
    const hasViolations = (d.validationMessages?.length ?? 0) > 0
    const status = allResolved && !hasViolations ? 'ready' : d.status   // only earn 'ready'
    return { ...d, status, reviewedAt }
  }))
```

- A document earns `ready` only when **every field is reviewed AND there are no
  validation failures**.
- Otherwise the status is left as-is (a `needs_review` doc stays `needs_review`; a
  doc already `ready` stays `ready`). `reviewedAt` is always stamped, so it becomes a
  real "a human looked at this" timestamp rather than write-only.

### FieldRow review affordances

Beyond today's `· edited` marker (kept, so the existing test stays green), `FieldRow`:
- Adds a **confirm control** (a checkmark button, `aria-label="Confirm {label}"`,
  `aria-pressed={isFieldReviewed(field)}`) that calls a new `onConfirm` prop and stops
  click propagation (so it does not also trigger row select). Reviewed fields (confirmed
  or edited) render the control in its active state.
- When edited, shows the **original AI value**: a muted `was: {originalValue}` line
  (with a `title` tooltip), in addition to the `· edited` marker.

`onConfirm` is added as a required prop; the four existing `FieldRow.test.tsx` render
calls are updated to pass `onConfirm={() => {}}`.

### Per-document summary, `Review`

In the Fields section header, render:
`{total} fields · {confirmed} confirmed · {corrected} corrected · {remaining} to review`
from `reviewSummary(doc)`.

### Soft export gate + failed-doc guard, `Review`

- The Export control currently renders for every status, including `failed` and
  `processing`. Gate it to `status === 'ready' || status === 'needs_review'` (the same
  predicate already used for the "Mark as reviewed" button).
- On choosing JSON or CSV, if `unreviewedCount(doc) > 0`, call
  `window.confirm('{n} fields haven\'t been reviewed, export anyway?')`; abort the
  download if the user cancels. This is a **soft warning, not a hard block** (override
  allowed).

## Decision 4, source-highlight defensive clamp + grace

Bounding boxes are an unverified identity pass-through (the eval has not run). Rather
than rewrite suspect numbers, **degrade rendering** for any value-bearing field whose
bbox cannot be drawn on the page.

### Pure predicate, `src/lib/bbox.ts` (new)

```ts
export function isBBoxRenderable(b: BBox): boolean
  // x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 100 + EPS && y + h <= 100 + EPS
  // EPS = 0.5 (tolerate edge rounding). All of x,y,w,h must be finite.
```

`{0,0,0,0}` is NOT renderable (`w > 0` fails), which is correct: an empty field's
empty box draws nothing.

### Render-time grace, `Review` + `DocumentViewer`

`Review` decides what to show for the selected field:
- value-bearing (`value !== ''`) AND `isBBoxRenderable(bbox)` -> pass `highlight` (today's behavior).
- value-bearing AND NOT renderable -> pass `highlight={null}` and `sourceMissing={true}`.
- empty value -> `highlight={null}`, `sourceMissing={false}` (the correct no-op, per Decision 4).
- no selection -> nothing.

`DocumentViewer` gains an optional `sourceMissing?: boolean` prop. It renders the
existing overlay when `highlight` is set (existing tests pass in-range boxes and stay
green), else when `sourceMissing` it renders a muted "Source not located on the page"
note (`data-testid="source-missing"`). The component stays dumb; the grace decision
lives in `Review` and in the pure predicate, both directly testable.

### The seam, and the flag

We do **not** rewrite bbox numbers. The `build.ts` bbox seam comment is updated to
state that the pass-through is unverified, that malformed boxes degrade gracefully at
render time via `isBBoxRenderable`, and that **if an eval run shows systematically
wrong coordinates (for example a 0 to 1000 space instead of 0 to 100), the real fix
is a scaling transform HERE at the seam** (shared by all forms), to be confirmed
against eval output. This increment ships the defensive grace; the scaling fix, if
needed, is a follow-up gated on eval evidence. Flagged for the user to confirm.

## CSV export gains a `reviewed` column

The recon's test ripple calls for updating the CSV header test; the faithful reading
is that the trust layer adds a column. `toCSV` appends a final `reviewed` column whose
value is `isFieldReviewed(f)` (`true`/`false`):

```
key,label,box,value,originalValue,confidence,type,reviewed
```

This lets the exported record carry the human-trust signal, which is the point of the
increment. **Flagged as a deliberate decision** (see Decisions log) so it can be
vetoed at plan review. `toJSON` is unchanged (it serializes the whole `Document`,
which now optionally includes `confirmed`/`validationMessages` automatically).

## Fixtures (8 docs)

The four W-2 fixtures gain the three new fields. Two are `ready` (acme, smallco) and
two are `needs_review` (jdoe, contoso, both already so today). 1099 fixtures (nec,
int, div) and the failed fixture (scan) are unchanged.

- **acme** (ready): new fields **arithmetic-consistent**, high confidence.
  socialSecurityWages is 84000.00 -> socialSecurityTaxWithheld 5208.00; medicareWages
  84000.00 -> medicareTaxWithheld 1218.00.
- **smallco** (ready): socialSecurityWages 45000.00 -> ss tax 2790.00; medicareWages
  45000.00 -> medicare tax 652.50. High confidence, consistent.
- **contoso** (needs_review by confidence: Box 2 conf 0.5): new fields consistent and
  high-confidence (no extra violation). socialSecurityWages 77000.00 -> ss tax
  4774.00; medicareWages 77000.00 -> medicare tax 1116.50. **This is the doc that can
  be fully resolved to `ready`** once a preparer reviews every field.
- **jdoe** (needs_review by confidence: two fields < 0.7): the **validation demo**.
  Its socialSecurityTaxWithheld is deliberately **inconsistent**: socialSecurityWages
  62000.00 expects ~3844.00 but the field reads 3500.00, at **high confidence (0.9)**
  so it is the cross-check (not confidence) that flags it, demonstrating independence.
  medicareWages 62000.00 -> medicare tax 899.00 (consistent). The fixture JSON carries
  a top-level `validationMessages: [{ fieldKey: 'socialSecurityTaxWithheld', message:
  'Box 4 social security tax should be about 6.2% of Box 3 social security wages
  (expected 3844.00, got 3500.00).' }]`, which `applyExtraction` now carries onto the
  Document.

All new bboxes stay within 0 to 100 (so the "every field bbox is within 0 to 100"
fixtures test stays green). Suggested placements near the existing Box 3 region:
Box 4 right of Box 3 same row; Box 5 below Box 3; Box 6 right of Box 5.

## Tests

### New

- `src/extract/checks.test.ts`: mask-aware SSN (`123-45-6789` and `XXX-XX-1234` both
  valid; `12-3` invalid), EIN (`12-3456789` valid, masked valid, `1234567` invalid),
  currency (`82,300.00`/`$82300`/`0.00` valid, `abc` invalid), `formatChecks` flags a
  bad SSN/EIN/currency and skips empty values and `text` fields.
- `src/lib/review.test.ts`: `isFieldReviewed` (confirmed true; edited; neither false;
  selection is not tracked here so not applicable), `reviewSummary` counts
  (corrected/confirmed/remaining/total), `unreviewedCount`.
- `src/lib/bbox.test.ts`: in-range true; `{0,0,0,0}` false; x+w>100 false; negative
  false; edge within EPS true.

### Updated (deliberately, reasons noted)

- `src/extract/w2.test.ts`: `okFields()` gains the 3 fields with **consistent** values
  (socialSecurityWages 60000.00 -> ss tax 3720.00, medicareWages 60000.00 -> medicare
  tax 870.00); length 7 -> 10; the key-order assertion already derives from
  `W2_FIELDS`. Add cases for `w2CrossChecks`: consistent -> `[]`; ss tax off by > $2 ->
  one message on `socialSecurityTaxWithheld`; empty operand -> skipped.
- `src/extract/build.test.ts`: add a case proving the **third OR is independent**, a
  `formDef` with `crossChecks: () => [{fieldKey,message}]` and all-confident non-empty
  fields still yields `needs_review`; and that `buildDocument` returns
  `validationMessages`.
- `src/extract/nec.test.ts` (representative for the 1099s): add a case that a
  malformed `payerTIN` (for example `1234`) yields `needs_review`. INT/DIV get the
  same one-line `crossChecks: formatChecks` wiring; their existing tests use valid
  values and stay green.
- `src/extract/extract.test.ts`: the W-2 extract payload gains the 3 fields with
  consistent valid values; W-2 field-count assertion 7 -> 10. 1099 payloads unchanged
  (valid formats).
- `src/api/documents.test.ts`: the hoisted `FAKE` payload is restructured to give
  valid, arithmetic-consistent per-field values for the 10 W-2 fields (so it stays
  `ready` under the new cross-checks); field-count assertion 7 -> 10. Assertions about
  statelessness/no-identity are unchanged.
- `src/fixtures.test.ts`: W-2 ready count 7 -> 10; first-needs_review field count 7 ->
  10; the explicit W2 key-order list gains the 3 keys in box order. The bbox-range and
  failed-doc tests are unchanged.
- `src/state/DocumentsContext.test.tsx`: the existing "markReviewed flips status to
  ready" test (clicks on jdoe) is replaced, jdoe now has a validation violation and
  unreviewed fields, so it must **stay** `needs_review`. Add: `confirmField` sets a
  field reviewed; a doc with all fields resolved and no violation flips to `ready`; a
  doc with unresolved fields stays `needs_review` with `reviewedAt` stamped.
- `src/pages/Review.test.tsx`: the "mark as reviewed flips the pill to Ready" test is
  updated, jdoe stays "Needs review" after marking (validation + unresolved). Add: the
  per-field summary renders; export warns when fields are unreviewed (stub
  `window.confirm`); a field with an out-of-range bbox shows "source not located"; an
  empty field is a no-op.
- `src/components/FieldRow.test.tsx`: existing render calls pass `onConfirm={() =>
  {}}`. Add: confirm control fires `onConfirm`; an edited field shows `was:
  {original}` and renders the confirm control as pressed; a `validationMessage` renders
  the warning.
- `src/components/DocumentViewer.test.tsx`: add a case that `sourceMissing` renders the
  note and no overlay. Existing overlay tests (in-range boxes) unchanged.
- `src/lib/export.test.ts`: header gains `,reviewed`; the two row expectations gain
  `,false` (both synthetic fields are unedited and unconfirmed).

### Unchanged (must stay green)

- `src/worker.test.ts` (routing), the eval tests (`scripts/eval/*.test.ts`). The
  eval's `SCORED_KEYS` is an **independent constant**, not derived from `W2_FIELDS`, so
  the 3 new W-2 fields are simply not scored by the eval this increment. Extending the
  eval to the new fields is out of scope.

The repo is at 122 passing tests; this increment changes counts and adds tests, all
deliberately. Final count rises; every change above is intentional.

## Out of scope

- New form types; 1099 arithmetic identities (1099s get format checks only); server
  persistence; auth; PDF rendering (F1).
- Recompute-of-cross-checks-on-edit (flagged limitation above).
- The bbox scaling transform at the seam (gated on eval evidence; flagged).
- Extending the eval harness to score the 3 new W-2 fields.
- The docs/get-started page, which comes *after* this lands and describes only what
  then exists (separate task, user will prompt).

## Decisions log

- The contract is extended with **optional** fields only (`Field.confirmed`,
  `Document.validationMessages`, `ExtractionResult.validationMessages`,
  `FormDefinition.crossChecks`). The frozen 8-key built-`Field` shape is preserved
  because `buildDocument` never sets `confirmed`.
- `crossChecks` is a new `FormDefinition` member **distinct from `validate`**:
  semantic checks on built fields, not structural parse of raw JSON.
- The cross-check violation list is a **third independent OR** in the status decision,
  not folded into the confidence test.
- `markReviewed` no longer forces `ready`; a doc earns `ready` only when all fields are
  reviewed and no validation failures remain. `reviewedAt` is always stamped.
- Validation messages are an **extraction-time snapshot**, not recomputed on edit
  (deferred, flagged).
- bbox numbers are **not rewritten**; malformed boxes degrade to "source not located"
  at render time via a shared pure predicate. A scaling fix, if eval shows systematic
  error, belongs at the build seam (flagged).
- CSV export gains a `reviewed` column (derived `isFieldReviewed`). **Deliberate, flagged**
  as the reading of the recon's CSV-header-test ripple; vetoable at plan review.
- The arithmetic tolerance is `$2.00` (named constant).
