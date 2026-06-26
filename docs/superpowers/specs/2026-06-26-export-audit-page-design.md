# Export / Audit page, design

Date: 2026-06-26

## Goal

Turn "Mark as reviewed" into a deliberate finish-and-export flow. "Mark as reviewed"
becomes a **gated Next** that, once a document is genuinely finished, carries the
reviewer to a new **Export / audit page** listing every officially reviewed form with
a per-form audit of every human judgment (corrections and acknowledgments), where
forms can be single or multi selected and exported as one combined file. The per-field
confirm control becomes a **toggle** (un-confirm), and a validation flag becomes
**human-acknowledgeable** rather than a permanent block: the preparer, not the tool,
is the final authority.

Outcomes that define done:

1. The per-document JSON/CSV dropdown leaves the Review header; all exporting happens
   on the new `/export` page.
2. "Mark as reviewed" finalizes a document and navigates to `/export` only when the
   document is genuinely finished (`ready`); otherwise it stays put and says what is
   blocking, including the option to acknowledge a flagged field.
3. A validation failure blocks the automatic "all clear" only. The reviewer can mark a
   flagged field "correct as-is" (acknowledge), which clears it for export and is
   recorded in the audit.
4. `/export` lists officially reviewed forms, shows each form's audit (corrections and
   acknowledgments), and exports the selected forms as one combined JSON or CSV file.

## Definitions

- **Officially reviewed**: `doc.status === 'ready' && doc.reviewedAt !== null`. Only
  these appear on the Export page. `needs_review`, `processing`, `failed` never do.
- **Corrected field**: `field.value !== field.originalValue`.
- **Current violations** of a document: its cross-checks recomputed live against its
  current field values (not the extraction-time snapshot), so an edit that makes a
  check pass removes the violation. See Live validation recompute.
- **Acknowledged field**: a field the reviewer explicitly marked "correct as-is"
  (`field.acknowledged === true`). Only offered on fields that currently show a
  violation.
- **Fully resolved** (the bar for `ready`): every field is reviewed (confirmed, edited,
  or acknowledged) AND every current violation is either gone (an edit made the check
  pass) or acknowledged.

## Live validation recompute (supersedes the trust-mechanics snapshot, on the client)

The trust-mechanics increment stored `validationMessages` as an extraction-time
snapshot and did not recompute on edit (a flagged value could never clear in-app).
This design recomputes violations live on the client so corrections clear flags and
acknowledgments are meaningful.

The cross-check functions must be importable by the client WITHOUT pulling
`@google/genai` into the client bundle. Today `w2CrossChecks` lives in `w2.ts`, which
imports `build.ts` -> `@google/genai` (worker-only; verified: no client-reachable file
imports `extract/*` today, and `checks.ts` imports types only). So:

- New genai-free module `src/extract/crosschecks.ts`:
  - Moves `w2CrossChecks` (and its `ARITHMETIC_TOLERANCE`) out of `w2.ts`. It imports
    only `formatChecks`, `parseAmount` from `./checks` and types. No `build`/`genai`.
  - Adds a resolver: `crossChecksFor(formType: string): (fields: Field[]) => ValidationMessage[]`
    returning `w2CrossChecks` for `'W-2'` and `formatChecks` for everything else (the
    1099s use format-only checks, matching the registry; unknown forms harmlessly get
    format checks).
- `w2.ts` imports `w2CrossChecks` from `./crosschecks`, keeps `crossChecks: w2CrossChecks`
  on `W2_FORM`, and re-exports it (`export { w2CrossChecks } from './crosschecks'`) so
  `w2.test.ts`'s `import { ..., w2CrossChecks } from './w2'` stays valid. `nec/int/div`
  keep `crossChecks: formatChecks` (unchanged).
- `src/lib/review.ts` gains `currentViolations(doc: Document): ValidationMessage[] =
  crossChecksFor(doc.formType)(doc.fields)`. This is the single client bridge into the
  genai-free `crosschecks.ts`. Pages/components import `currentViolations` from
  `review.ts`, never from `extract` directly.

The stored `Document.validationMessages` (server, additive contract) is unchanged but
the client now uses `currentViolations` for display and gating.

## Contract addition (additive, same pattern as `confirmed`)

`src/types.ts`: add optional `acknowledged?: boolean` to `Field`. Nothing removed or
renamed. The built-`Field` shape produced by `buildDocument` is unchanged (it never
sets `acknowledged`, just as it never sets `confirmed`).

## Context actions (`DocumentsContext`)

- `confirmField(docId, key)` becomes a **toggle**:
  `f.key === key ? { ...f, confirmed: !f.confirmed } : f`. A confirmed field can be
  un-confirmed.
- New `acknowledgeField(docId, key)` (toggle, same shape):
  `{ ...f, acknowledged: !f.acknowledged }`. Added to `DocumentsContextValue`, the
  callback set, and the `useMemo` value + deps.

## Review helpers (`src/lib/review.ts`)

- `isFieldReviewed(field)` = `field.confirmed === true || field.acknowledged === true ||
  field.value !== field.originalValue` (confirmed, acknowledged, OR edited). Acknowledging
  a flagged field both reviews it and (when acknowledged) resolves its violation.
- `reviewSummary(doc)` keeps `{ total, confirmed, corrected, remaining }`, with
  acknowledgment folded into the affirmed bucket so the totals still sum and the summary
  line is unchanged:
  - `corrected` = `value !== originalValue`
  - `confirmed` = `(confirmed === true || acknowledged === true) && value === originalValue`
  - `remaining` = none of the above (not edited, not confirmed, not acknowledged)
  - `total` = `fields.length` = corrected + confirmed + remaining
- `unreviewedCount(doc)` = `remaining` (unchanged definition, now acknowledgment-aware).
- `canBeReady(doc)`:
  ```ts
  const allReviewed = doc.fields.every(isFieldReviewed)
  const violations = currentViolations(doc)
  const acked = new Set(doc.fields.filter((f) => f.acknowledged).map((f) => f.key))
  const unresolved = violations.some((v) => !acked.has(v.fieldKey))
  return allReviewed && !unresolved
  ```
- `isOfficiallyReviewed(doc)` = `doc.status === 'ready' && doc.reviewedAt !== null`.

`markReviewed` in `DocumentsContext` already calls `canBeReady`; the new internals flow
through automatically (always stamps `reviewedAt`; sets `ready` iff `canBeReady`, else
preserves status).

## "Mark as reviewed" becomes a gated Next (Review page)

Same label, same visibility (`ready` or `needs_review` only). On click:
1. `const willBeReady = doc.status === 'ready' || canBeReady(doc)` (mirrors
   `markReviewed`'s status logic, so it predicts the post-update status).
2. `markReviewed(doc.id)`.
3. If `willBeReady`, `navigate('/export')`. Otherwise set `blocked` and stay.

When `blocked`, render an inline banner in `<main>` (above the document/fields grid),
computed live so it updates as the reviewer resolves things:
- If `unreviewedCount(doc) > 0`: "`{n}` field(s) still need review. Confirm or correct
  them to finish."
- If there is at least one unacknowledged current violation: "Resolve or acknowledge
  the flagged field before finishing."

Both lines show when both apply. The old soft `window.confirm` "export anyway?" gate and
the `canExport`/`confirmExport` logic and the export dropdown are **removed** from
Review. The per-document summary line stays. The displayed per-field validation messages
now come from `currentViolations(doc)` (live), not the static snapshot.

## FieldRow: acknowledge affordance + acknowledged styling

`FieldRow` props add optional `acknowledged?: boolean` and `onAcknowledge?: () => void`.
The confirm checkmark and `was: {originalValue}` display are unchanged.

When a field has a live `validationMessage` (passed by Review), the warning block also
renders an **Acknowledge (correct as-is)** toggle button (when `onAcknowledge` is
provided):
- Not acknowledged: the red flag treatment (`bg-flag-bg`/`text-flag`, the existing
  `field-warning` testid) plus a button labeled to mark it correct as-is.
- Acknowledged: a **visually distinct** treatment (neutral/muted, not red), text along
  the lines of "Acknowledged as correct: {message}", with the button in its pressed
  state (`aria-pressed`) to toggle back. `data-testid="field-acknowledged"`.

The amber confidence dot stays independent. Fields with no current violation render no
warning and no acknowledge control (an edit that clears the check removes both).

## Flow and routing

- New route `/export` -> `src/pages/Export.tsx`, registered in `App.tsx`.
- Reachable via the gated Next AND a new **Export** link in the Home (`/app`) header
  next to Guide; also directly URL addressable.

## The Export page

`Export.tsx` reads `documents` from `useDocuments()`,
`const reviewed = documents.filter(isOfficiallyReviewed)`.

- Header: title "Export reviewed forms", a back link to `/app`, a **select-all**
  checkbox, and an `Export selected` dropdown (same menu pattern as the old Review
  export menu) with **JSON** and **CSV**, disabled when zero selected.
- Selection: `useState<Set<string>>` lazily initialized to all reviewed ids (open with
  everything selected); per-row checkbox + select-all mutate it, keyed by `doc.id`.
- Rows via `src/components/ExportFormRow.tsx`, props `{ doc, selected, onToggle }`:
  - select checkbox; `doc.filename`; `FormTypeBadge`; `reviewed {date}`; the
    `reviewSummary` line; a **Review ->** link to `/review/${doc.id}`.
  - Audit (every human judgment):
    - **Corrections**: each corrected field as `{label}: was {originalValue} -> now {value}`.
    - **Acknowledgments**: each entry of `currentViolations(doc)` whose field is
      acknowledged, as `{label}: {message}, acknowledged by reviewer`.
    - "no changes" only when there are neither corrections nor acknowledgments.
- Empty state when `reviewed.length === 0`: a message and a link to `/app`, no export
  controls. (Not unit tested: the only document source is the fixed fixture-seeded
  provider, which always has reviewed docs; the branch is a trivial conditional.)
- Export action: gather `reviewed.filter((d) => selectedIds.has(d.id))` and
  `downloadFile('reviewed-forms.json', 'application/json', toCombinedJSON(docs))` or
  `downloadFile('reviewed-forms.csv', 'text/csv', toCombinedCSV(docs))`; close the menu.
  Even a single selected form goes through the combined functions.

## Combined export (`src/lib/export.ts`)

Additive; existing `toJSON`, `toCSV`, `csvCell`, `downloadFile` are unchanged and kept
(still unit tested, reused as building blocks).

- `toCombinedJSON(docs: Document[]): string` = `JSON.stringify(docs, null, 2)` (an array
  of the full selected `Document`s, so the JSON carries the complete record including
  `confirmed`/`acknowledged`/`originalValue`).
- `toCombinedCSV(docs: Document[]): string` emits a **normalized long format**, chosen
  deliberately so a flat table with mixed form types (a W-2 row and a 1099-DIV row have
  different fields) imports cleanly downstream, one row per field per selected document:
  - header: `filename,formType,fieldKey,fieldLabel,box,value`
  - rows: `docs.flatMap((d) => d.fields.map((f) => [d.filename, d.formType, f.key, f.label, f.box, f.value].map(csvCell).join(',')))`
  - The audit detail (originalValue, confirmed, acknowledged) lives in the JSON export
    and the on-screen audit, not in this CSV (CSV is the clean values-for-import
    deliverable).

## Fixtures

In `src/fixtures.ts`, give two already-`ready` 1099 entries a `reviewedAt` so the Export
page opens populated:
- `doc-nec`: `reviewedAt: '2026-03-12T10:00:00.000Z'`
- `doc-int`: `reviewedAt: '2026-03-12T11:30:00.000Z'`

`doc-div` stays `reviewedAt: null`. With the already-reviewed `acme` and `smallco`, the
page opens with four officially reviewed forms (two W-2, two 1099). `jdoe` is **not**
seeded acknowledged: it stays the live demonstration (its Box 4 arithmetic flag blocks
finishing until the reviewer reviews all fields and acknowledges the flag, at which
point it becomes exportable with the acknowledgment recorded in its audit). Touches only
`src/fixtures.ts` base metadata; `fixtures.test.ts` does not assert `reviewedAt`, so it
stays green.

## Tests

### New

- `src/extract/crosschecks.test.ts`: `crossChecksFor('W-2')` returns the arithmetic+format
  checker (a W-2 with a bad Box 4 yields a violation; a consistent one yields none);
  `crossChecksFor('1099-NEC')` returns format-only (a bad TIN yields a violation, a W-2
  arithmetic mismatch in 1099 fields is not invented). (The moved `w2CrossChecks` cases
  continue to live in `w2.test.ts` via the re-export.)
- `src/lib/review.test.ts` (extend): `isOfficiallyReviewed` true/false matrix;
  `currentViolations` recomputes from current fields (an edited-to-passing W-2 has none;
  an unedited flagged one has the violation); `canBeReady` is false with an unresolved
  current violation and true once that field is acknowledged; `isFieldReviewed` true when
  acknowledged; `reviewSummary` folds an acknowledged-unchanged field into `confirmed`.
- `src/components/ExportFormRow.test.tsx`: renders filename/badge/summary and a Review
  link; lists a corrected field as `was X -> now Y`; lists an acknowledged violation as
  `..., acknowledged by reviewer`; "no changes" when neither; checkbox reflects/toggles.
- `src/pages/Export.test.tsx`: lists only officially reviewed docs (acme, smallco, nec,
  int), not contoso/jdoe/div/scan; select-all and per-row selection drive the
  export-enabled state (dropdown disabled at zero selected); choosing CSV/JSON triggers a
  download (stub the `../lib/export` download).

### Updated (deliberate ripple, reasons noted)

- `src/extract/w2.ts` / `w2.test.ts`: `w2CrossChecks` moves to `crosschecks.ts` and is
  re-exported from `w2.ts`; `w2.test.ts` imports stay valid (it still imports from
  `./w2`). No assertion changes expected.
- `src/state/DocumentsContext.tsx` / `.test.tsx`: `confirmField` toggles (add a
  toggle-off case: a second call returns the field to not-confirmed); add `acknowledgeField`
  toggle test. The existing "markReviewed does not force ready when unresolved/flagged"
  (jdoe) test stays valid.
- `src/pages/Review.tsx` / `Review.test.tsx`:
  - Remove the two export-dropdown tests ("warns before exporting" and "failed doc does
    not render the Export control"): the dropdown and soft warn are gone.
  - The jdoe "does not flip to Ready" test gains: a blocking banner appears and the route
    did not change to `/export`.
  - Add: Mark as reviewed on an already-`ready` doc (doc-acme) navigates to `/export`
    (test harness gains an `/export` route rendering a marker).
  - Keep summary, validation-warning, highlight, guide-link, not-found tests.
- `src/lib/review.test.ts`: the trust-mechanics `canBeReady` "violations present -> false"
  case is rewritten: gating now uses live `currentViolations`, not the passed
  `validationMessages`, so the case must craft a doc whose current fields actually produce
  a violation, and add the acknowledge-clears-it case.
- `src/components/FieldRow.test.tsx`: the validation-warning test passes `onAcknowledge`
  and asserts the acknowledge control renders; add an acknowledged-state test (distinct
  treatment, `aria-pressed`). The other FieldRow tests are unchanged (no `validationMessage`,
  so no acknowledge control, `onAcknowledge` optional).
- `src/pages/Home.test.tsx`: add that the header has an Export link to `/export`.
- `src/lib/export.test.ts`: add `toCombinedJSON` (array round-trip) and `toCombinedCSV`
  (long-format header + one row per field across multiple docs) cases; existing
  `toJSON`/`toCSV` cases unchanged.

### Unchanged

The rest of the trust-mechanics suite stays green (checks, build, nec/int/div, fixtures,
bbox, DocumentViewer, applyExtraction). The branch is at 151 tests; this work changes
counts deliberately and adds tests.

## File structure

New:
- `src/extract/crosschecks.ts` (+ `crosschecks.test.ts`) -- genai-free `w2CrossChecks` + `crossChecksFor`
- `src/pages/Export.tsx` (+ `Export.test.tsx`)
- `src/components/ExportFormRow.tsx` (+ `ExportFormRow.test.tsx`)

Modified:
- `src/extract/w2.ts` (move out `w2CrossChecks`, import + re-export it)
- `src/types.ts` (`Field.acknowledged?`)
- `src/state/DocumentsContext.tsx` (`confirmField` toggle, `acknowledgeField`)
- `src/lib/review.ts` (`currentViolations`, `isFieldReviewed`/`reviewSummary`/`canBeReady`
  acknowledgment-aware, `isOfficiallyReviewed`)
- `src/lib/export.ts` (`toCombinedJSON`, `toCombinedCSV`)
- `src/components/FieldRow.tsx` (acknowledge affordance + acknowledged styling)
- `src/pages/Review.tsx` (gated Next + nav + banner; remove dropdown + soft gate; live
  violations; acknowledge wiring)
- `src/pages/Home.tsx` (Export header link)
- `src/App.tsx` (`/export` route)
- `src/fixtures.ts` (reviewedAt for nec, int)
- Test files listed above.

## Out of scope

- A zip or per-file bulk download (combined single file only).
- Persisting selection/review state across reloads (in-memory, as today).
- Recompute of the SERVER `validationMessages` snapshot (the server value is left as-is;
  the client recomputes live for its own display/gating).
- Reaching `/export` from the Review header (Home link + Next + direct URL suffice).
- New form types, server persistence, auth, PDF rendering.

## Decisions log

- A validation flag is human-acknowledgeable, not a permanent block: `acknowledgeField`
  toggles `Field.acknowledged`; an acknowledged violation counts as resolved for gating
  and is recorded in the audit. jdoe is the live demo (not seeded acknowledged).
- Violations are recomputed live on the client (`currentViolations` via a genai-free
  `crosschecks.ts`), so an edit that makes a check pass clears it; this supersedes the
  trust-mechanics client-side snapshot behavior.
- `isFieldReviewed` and `reviewSummary` treat acknowledgment as an affirming review;
  acknowledged-unchanged fields fold into the `confirmed` summary bucket.
- "Mark as reviewed" is a gated Next: navigates to `/export` only when the doc ends up
  `ready`, else stays and explains the block (now including the acknowledge path).
- Combined CSV is a normalized long format (`filename,formType,fieldKey,fieldLabel,box,value`,
  one row per field) for clean downstream import; `toCombinedJSON` is an array of full
  Documents.
- The per-doc JSON/CSV dropdown is removed from Review; all export is on `/export`.
- `confirmField` toggles; the confirm control's pressed state stays tied to
  `isFieldReviewed`.
- Two 1099 fixtures (`nec`, `int`) are seeded `reviewedAt` so the demo opens with four
  forms.
- `w2CrossChecks` moves to `crosschecks.ts` (genai-free) and is re-exported from `w2.ts`
  so existing tests stay green; `toJSON`/`toCSV` are kept as building blocks.
