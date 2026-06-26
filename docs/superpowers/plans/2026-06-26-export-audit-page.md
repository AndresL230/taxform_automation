# Export / Audit Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Mark as reviewed" a gated Next into a new `/export` audit page that lists officially reviewed forms with a per-form audit of every human judgment (corrections and acknowledgments) and exports the selected forms as one combined file; make the confirm control a toggle; and make a validation flag human-acknowledgeable rather than a permanent block, with violations recomputed live on the client.

**Architecture:** Cross-check logic is extracted into a genai-free `src/extract/crosschecks.ts` so the client can recompute violations live (`crossChecksFor` -> `currentViolations`) without pulling `@google/genai` into the client bundle. Per-field `acknowledged` (additive contract) plus live recompute drive an acknowledgeable gate in `canBeReady`. The Review export dropdown is removed; all export moves to `/export`.

**Tech Stack:** React 18 + TypeScript, Vite, react-router-dom, Vitest + @testing-library/react (jsdom), Tailwind v4.

## Global Constraints

- **No em dashes or en dashes** (`—` `–`) anywhere (code, comments, copy, commits). Use a comma or colon. The rightwards arrow `→` (U+2192) is NOT a dash and is used in the codebase already; it is allowed in audit text.
- **No `Co-Authored-By` trailer** on commits.
- **Contract additive only**: add optional `Field.acknowledged?`; remove/rename nothing. `buildDocument`'s built-`Field` shape is unchanged (never sets `acknowledged`).
- **Keep the client genai-free**: client-reachable code (`src/lib/*`, `src/pages/*`, `src/components/*`, `src/state/*`) must NOT import `src/extract/w2.ts`, `build.ts`, or `registry.ts` (they pull `@google/genai`). Use `src/extract/crosschecks.ts` and `src/extract/checks.ts` (types-only imports) instead.
- **Keep all existing tests green** unless a step deliberately updates one, reason noted.
- TDD: failing test first, run it red, implement, run it green, full suite before commit.
- Test command: single file `npx vitest run <path>`; full suite `npm test`.

## File Structure

New:
- `src/extract/crosschecks.ts` (+ `crosschecks.test.ts`) -- genai-free `w2CrossChecks` + `crossChecksFor`
- `src/pages/Export.tsx` (+ `Export.test.tsx`)
- `src/components/ExportFormRow.tsx` (+ `ExportFormRow.test.tsx`)

Modified: `src/types.ts`, `src/extract/w2.ts`, `src/lib/review.ts`, `src/state/DocumentsContext.tsx`, `src/lib/export.ts`, `src/components/FieldRow.tsx`, `src/pages/Review.tsx`, `src/pages/Home.tsx`, `src/App.tsx`, `src/fixtures.ts`, and the test files for each.

---

### Task 1: Genai-free crosschecks module + acknowledged contract field

**Files:**
- Create: `src/extract/crosschecks.ts`, `src/extract/crosschecks.test.ts`
- Modify: `src/extract/w2.ts`, `src/types.ts`

**Interfaces:**
- Produces: `w2CrossChecks(fields: Field[]): ValidationMessage[]` (moved), `crossChecksFor(formType: string): (fields: Field[]) => ValidationMessage[]`; optional `Field.acknowledged?: boolean`.

- [ ] **Step 1: Add the acknowledged contract field**

In `src/types.ts`, add to the `Field` type after `confirmed?: boolean`:

```ts
  acknowledged?: boolean
```

- [ ] **Step 2: Write the failing crosschecks test**

Create `src/extract/crosschecks.test.ts`:

```ts
import { crossChecksFor } from './crosschecks'
import type { Field } from '../types'

const f = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: '', originalValue: '', confidence: 0.95, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})

test('crossChecksFor W-2 runs arithmetic and format checks', () => {
  const fields = [
    f({ key: 'socialSecurityWages', type: 'currency', value: '60000.00' }),
    f({ key: 'socialSecurityTaxWithheld', type: 'currency', value: '3000.00' }), // expected 3720
  ]
  expect(crossChecksFor('W-2')(fields).map((m) => m.fieldKey)).toContain('socialSecurityTaxWithheld')
})

test('crossChecksFor W-2 returns none for consistent values', () => {
  const fields = [
    f({ key: 'socialSecurityWages', type: 'currency', value: '60000.00' }),
    f({ key: 'socialSecurityTaxWithheld', type: 'currency', value: '3720.00' }),
  ]
  expect(crossChecksFor('W-2')(fields)).toEqual([])
})

test('crossChecksFor 1099 forms are format-only', () => {
  const fields = [
    f({ key: 'payerTIN', type: 'ein', value: '1234' }),               // bad EIN
    f({ key: 'recipientTIN', type: 'ssn', value: '123-45-6789' }),    // valid
  ]
  expect(crossChecksFor('1099-NEC')(fields).map((m) => m.fieldKey)).toEqual(['payerTIN'])
})
```

Run: `npx vitest run src/extract/crosschecks.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `crosschecks.ts` (move `w2CrossChecks`, add resolver)**

Create `src/extract/crosschecks.ts`:

```ts
import { formatChecks, parseAmount } from './checks'
import type { Field, ValidationMessage } from '../types'

const ARITHMETIC_TOLERANCE = 2.0 // dollars; covers cent-level rounding on both operands

// W-2 semantic checks: shared format checks plus the two payroll-tax identities.
// Skips an identity if either operand is empty or unparseable (defensive).
export function w2CrossChecks(fields: Field[]): ValidationMessage[] {
  const messages = formatChecks(fields)
  const byKey = new Map(fields.map((f) => [f.key, f]))

  const arithmetic = (taxKey: string, wageKey: string, rate: number, message: (exp: string, got: string) => string) => {
    const tax = byKey.get(taxKey)
    const wage = byKey.get(wageKey)
    if (!tax || !wage || tax.value === '' || wage.value === '') return
    const taxAmt = parseAmount(tax.value)
    const wageAmt = parseAmount(wage.value)
    if (taxAmt === null || wageAmt === null) return // bad format already reported
    const expected = wageAmt * rate
    if (Math.abs(taxAmt - expected) > ARITHMETIC_TOLERANCE) {
      messages.push({ fieldKey: taxKey, message: message(expected.toFixed(2), tax.value) })
    }
  }

  arithmetic('socialSecurityTaxWithheld', 'socialSecurityWages', 0.062, (exp, got) =>
    `Box 4 social security tax should be about 6.2% of Box 3 social security wages (expected ${exp}, got ${got}).`)
  arithmetic('medicareTaxWithheld', 'medicareWages', 0.0145, (exp, got) =>
    `Box 6 Medicare tax should be about 1.45% of Box 5 Medicare wages (expected ${exp}, got ${got}).`)

  return messages
}

// Resolve a form type to its cross-check function. Client-safe (imports only ./checks
// and types, never build/registry/@google/genai), so the client can recompute
// violations live. W-2 gets arithmetic + format; every other form gets format-only,
// matching the registry's assignment.
export function crossChecksFor(formType: string): (fields: Field[]) => ValidationMessage[] {
  return formType === 'W-2' ? w2CrossChecks : formatChecks
}
```

- [ ] **Step 4: Point `w2.ts` at the moved function**

In `src/extract/w2.ts`:
- Change the imports: remove `import { formatChecks, parseAmount } from './checks'`; add `import { w2CrossChecks } from './crosschecks'`. Change `import type { DocStatus, Field, FieldDef, ValidationMessage } from '../types'` to `import type { DocStatus, Field, FieldDef } from '../types'` (ValidationMessage no longer used here).
- Delete the `ARITHMETIC_TOLERANCE` const and the entire `w2CrossChecks` function definition (lines 35-62).
- Keep `crossChecks: w2CrossChecks` on `W2_FORM` (now using the imported function).
- Add a re-export so `w2.test.ts` keeps working: directly after the imports add

```ts
export { w2CrossChecks } from './crosschecks'
```

- [ ] **Step 5: Run crosschecks + w2 tests, then full suite**

Run: `npx vitest run src/extract/crosschecks.test.ts src/extract/w2.test.ts`
Expected: PASS (w2.test.ts unchanged, imports `w2CrossChecks` through the re-export).

Run: `npm test`
Expected: all pass (151 + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/extract/crosschecks.ts src/extract/crosschecks.test.ts src/extract/w2.ts src/types.ts
git commit -m "feat: genai-free crosschecks module and acknowledged field"
```

---

### Task 2: Live recompute + acknowledgment-aware review helpers

**Files:**
- Modify: `src/lib/review.ts`, `src/lib/review.test.ts`

**Interfaces:**
- Consumes: `crossChecksFor` (Task 1).
- Produces: `currentViolations(doc)`, `isOfficiallyReviewed(doc)`; `isFieldReviewed`/`reviewSummary`/`canBeReady` acknowledgment-aware.

- [ ] **Step 1: Update the failing review tests**

In `src/lib/review.test.ts`:
- Update the import to add the new helpers: `import { isFieldReviewed, reviewSummary, unreviewedCount, canBeReady, currentViolations, isOfficiallyReviewed } from './review'`.
- In the `isFieldReviewed` test, add: `expect(isFieldReviewed(fld({ acknowledged: true }))).toBe(true)`.
- REPLACE the existing `canBeReady requires all fields resolved and no violations` test (the one passing `validationMessages`) with these, since gating now uses live `currentViolations`, not the static array:

```ts
test('canBeReady requires every field reviewed', () => {
  expect(canBeReady(doc([fld({ confirmed: true }), fld({ value: 'x', originalValue: 'y' })]))).toBe(true)
  expect(canBeReady(doc([fld({ confirmed: true }), fld({})]))).toBe(false)
})

test('currentViolations recomputes from current values', () => {
  const flagged = [
    fld({ key: 'socialSecurityWages', type: 'currency', value: '60000.00', originalValue: '60000.00' }),
    fld({ key: 'socialSecurityTaxWithheld', type: 'currency', value: '3000.00', originalValue: '3720.00' }),
  ]
  expect(currentViolations(doc(flagged)).map((v) => v.fieldKey)).toEqual(['socialSecurityTaxWithheld'])
  const fixed = flagged.map((f) => (f.key === 'socialSecurityTaxWithheld' ? { ...f, value: '3720.00' } : f))
  expect(currentViolations(doc(fixed))).toEqual([])
})

test('canBeReady: a current violation blocks unless acknowledged', () => {
  const fields = [
    fld({ key: 'socialSecurityWages', type: 'currency', value: '60000.00', originalValue: '60000.00', confirmed: true }),
    fld({ key: 'socialSecurityTaxWithheld', type: 'currency', value: '3000.00', originalValue: '3000.00', confirmed: true }),
  ]
  expect(canBeReady(doc(fields))).toBe(false)
  const acked = fields.map((f) => (f.key === 'socialSecurityTaxWithheld' ? { ...f, acknowledged: true } : f))
  expect(canBeReady(doc(acked))).toBe(true)
})

test('reviewSummary folds an acknowledged unchanged field into confirmed', () => {
  expect(reviewSummary(doc([fld({ acknowledged: true })]))).toEqual({ total: 1, confirmed: 1, corrected: 0, remaining: 0 })
})

test('isOfficiallyReviewed is true only for ready with a reviewedAt', () => {
  const base = (over: Partial<import('../types').Document>) => ({ ...doc([]), ...over })
  expect(isOfficiallyReviewed(base({ status: 'ready', reviewedAt: '2026-01-01T00:00:00.000Z' }))).toBe(true)
  expect(isOfficiallyReviewed(base({ status: 'ready', reviewedAt: null }))).toBe(false)
  expect(isOfficiallyReviewed(base({ status: 'needs_review', reviewedAt: '2026-01-01T00:00:00.000Z' }))).toBe(false)
  expect(isOfficiallyReviewed(base({ status: 'failed', reviewedAt: '2026-01-01T00:00:00.000Z' }))).toBe(false)
})
```

(The existing `doc(...)` helper sets `formType: 'W-2'`, so `currentViolations`/`canBeReady` run `w2CrossChecks` on the crafted fields. Text fields with unrelated keys produce no violations.)

Run: `npx vitest run src/lib/review.test.ts`
Expected: FAIL (`currentViolations`/`isOfficiallyReviewed` missing; canBeReady/reviewSummary not acknowledgment-aware).

- [ ] **Step 2: Rewrite `review.ts`**

Replace `src/lib/review.ts` with:

```ts
import type { Document, Field, ValidationMessage } from '../types'
import { crossChecksFor } from '../extract/crosschecks'

// A field is reviewed when a human confirmed it, acknowledged it (correct as-is), or
// edited it. Selection/focus alone does not count.
export function isFieldReviewed(field: Field): boolean {
  return field.confirmed === true || field.acknowledged === true || field.value !== field.originalValue
}

export function reviewSummary(doc: Document): { total: number; confirmed: number; corrected: number; remaining: number } {
  let confirmed = 0
  let corrected = 0
  let remaining = 0
  for (const f of doc.fields) {
    if (f.value !== f.originalValue) corrected++
    else if (f.confirmed === true || f.acknowledged === true) confirmed++
    else remaining++
  }
  return { total: doc.fields.length, confirmed, corrected, remaining }
}

export function unreviewedCount(doc: Document): number {
  return reviewSummary(doc).remaining
}

// Cross-checks recomputed live against the document's CURRENT field values (not the
// extraction-time snapshot), so an edit that makes a check pass clears its violation.
// Uses the genai-free resolver, so the client never pulls in @google/genai.
export function currentViolations(doc: Document): ValidationMessage[] {
  return crossChecksFor(doc.formType)(doc.fields)
}

// A document earns ready only when every field is reviewed and every current
// validation violation is acknowledged. The preparer, not the tool, is the authority.
export function canBeReady(doc: Document): boolean {
  const allReviewed = doc.fields.every(isFieldReviewed)
  const acked = new Set(doc.fields.filter((f) => f.acknowledged).map((f) => f.key))
  const unresolved = currentViolations(doc).some((v) => !acked.has(v.fieldKey))
  return allReviewed && !unresolved
}

export function isOfficiallyReviewed(doc: Document): boolean {
  return doc.status === 'ready' && doc.reviewedAt !== null
}
```

- [ ] **Step 3: Run review tests + full suite**

Run: `npx vitest run src/lib/review.test.ts`
Expected: PASS.

Run: `npm test`
Expected: all pass. (DocumentsContext markReviewed on jdoe still yields `needs_review`: jdoe has unreviewed fields and an unacknowledged live violation.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/review.ts src/lib/review.test.ts
git commit -m "feat: live violation recompute and acknowledgment-aware review gating"
```

---

### Task 3: confirmField toggle + acknowledgeField action

**Files:**
- Modify: `src/state/DocumentsContext.tsx`, `src/state/DocumentsContext.test.tsx`

**Interfaces:**
- Produces: `confirmField` (now toggles), `acknowledgeField(docId, key)` (toggle).

- [ ] **Step 1: Update the failing context tests**

In `src/state/DocumentsContext.test.tsx`:
- Add `acknowledgeField` to the `useDocuments()` destructure in `Harness`.
- Add to the Harness JSX (near the existing `confirm` button and spans):

```tsx
      <button onClick={() => acknowledgeField('doc-jdoe', 'wages')}>ack</button>
      <span data-testid="jdoe-wages-acknowledged">
        {String(documents.find((d) => d.id === 'doc-jdoe')?.fields.find((f) => f.key === 'wages')?.acknowledged ?? false)}
      </span>
```

- Add tests:

```ts
test('confirmField toggles confirmed off on a second call', () => {
  setup()
  act(() => { screen.getByText('confirm').click() })
  expect(screen.getByTestId('jdoe-wages-confirmed').textContent).toBe('true')
  act(() => { screen.getByText('confirm').click() })
  expect(screen.getByTestId('jdoe-wages-confirmed').textContent).toBe('false')
})

test('acknowledgeField toggles acknowledged', () => {
  setup()
  expect(screen.getByTestId('jdoe-wages-acknowledged').textContent).toBe('false')
  act(() => { screen.getByText('ack').click() })
  expect(screen.getByTestId('jdoe-wages-acknowledged').textContent).toBe('true')
})
```

(The existing "confirmField marks a field confirmed" single-click test stays valid.)

Run: `npx vitest run src/state/DocumentsContext.test.tsx`
Expected: FAIL (`acknowledgeField` missing; confirm does not toggle off).

- [ ] **Step 2: Implement the toggle + new action**

In `src/state/DocumentsContext.tsx`:
- Add to `DocumentsContextValue` after `confirmField`:

```ts
  acknowledgeField(docId: string, key: string): void
```

- Change `confirmField`'s field update from `{ ...f, confirmed: true }` to `{ ...f, confirmed: !f.confirmed }`.
- Add the `acknowledgeField` callback after `confirmField`:

```ts
  const acknowledgeField = useCallback((docId: string, key: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, acknowledged: !f.acknowledged } : f)) } : d,
      ),
    )
  }, [])
```

- Add `acknowledgeField` to the `value` memo object and its dependency array.

Run: `npx vitest run src/state/DocumentsContext.test.tsx`
Expected: PASS.

- [ ] **Step 3: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/state/DocumentsContext.tsx src/state/DocumentsContext.test.tsx
git commit -m "feat: confirmField toggles and acknowledgeField action"
```

---

### Task 4: Combined export functions (long-format CSV + JSON array)

**Files:**
- Modify: `src/lib/export.ts`, `src/lib/export.test.ts`

**Interfaces:**
- Produces: `toCombinedJSON(docs: Document[])`, `toCombinedCSV(docs: Document[])`.

- [ ] **Step 1: Write the failing export tests**

In `src/lib/export.test.ts`, add to the import: `import { toJSON, toCSV, toCombinedJSON, toCombinedCSV } from './export'`. Add:

```ts
test('toCombinedJSON round-trips an array of documents', () => {
  expect(JSON.parse(toCombinedJSON([doc]))).toEqual([doc])
})

test('toCombinedCSV emits long format: filename,formType then one row per field', () => {
  const lines = toCombinedCSV([doc]).split('\n')
  expect(lines[0]).toBe('filename,formType,fieldKey,fieldLabel,box,value')
  expect(lines[1]).toBe('a.pdf,W-2,wages,"Wages, tips, other comp.",1,"60,000.00"')
  expect(lines[2]).toBe('a.pdf,W-2,employer,"Employer, Inc.",c,"A, B Co"')
})
```

Run: `npx vitest run src/lib/export.test.ts`
Expected: FAIL (functions missing).

- [ ] **Step 2: Implement the combined functions**

In `src/lib/export.ts`, add after `toCSV` (reusing the existing `csvCell`):

```ts
// One JSON file: the full selected documents (carries the complete audit record,
// including confirmed/acknowledged/originalValue).
export function toCombinedJSON(docs: Document[]): string {
  return JSON.stringify(docs, null, 2)
}

// One CSV file in normalized long format (one row per field per document, with
// filename/formType provenance columns). Long format is chosen so mixed form types
// import cleanly downstream rather than fighting a wide table of disjoint columns.
export function toCombinedCSV(docs: Document[]): string {
  const header = ['filename', 'formType', 'fieldKey', 'fieldLabel', 'box', 'value']
  const rows = docs.flatMap((d) =>
    d.fields.map((f) => [d.filename, d.formType, f.key, f.label, f.box, f.value].map(csvCell).join(',')),
  )
  return [header.join(','), ...rows].join('\n')
}
```

Run: `npx vitest run src/lib/export.test.ts`
Expected: PASS (existing toJSON/toCSV cases unchanged).

- [ ] **Step 3: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/lib/export.ts src/lib/export.test.ts
git commit -m "feat: combined long-format CSV and JSON-array exporters"
```

---

### Task 5: FieldRow acknowledge affordance

**Files:**
- Modify: `src/components/FieldRow.tsx`, `src/components/FieldRow.test.tsx`

**Interfaces:**
- Consumes: `isFieldReviewed` (Task 2).
- Produces: `FieldRow` props gain optional `acknowledged?: boolean`, `onAcknowledge?: () => void`.

- [ ] **Step 1: Update the failing FieldRow tests**

In `src/components/FieldRow.test.tsx`:
- Replace the existing "renders a validation warning" test with:

```ts
test('renders a validation warning with an acknowledge control', () => {
  render(<FieldRow field={base} selected={false} validationMessage="Not a valid dollar amount." onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} onAcknowledge={() => {}} />)
  expect(screen.getByTestId('field-warning')).toHaveTextContent('Not a valid dollar amount.')
  expect(screen.getByRole('button', { name: /acknowledge/i })).toHaveAttribute('aria-pressed', 'false')
})

test('acknowledge control fires onAcknowledge', async () => {
  const onAcknowledge = vi.fn()
  render(<FieldRow field={base} selected={false} validationMessage="Not a valid dollar amount." onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} onAcknowledge={onAcknowledge} />)
  await userEvent.click(screen.getByRole('button', { name: /acknowledge/i }))
  expect(onAcknowledge).toHaveBeenCalled()
})

test('an acknowledged validation shows a distinct acknowledged treatment', () => {
  render(<FieldRow field={base} selected={false} validationMessage="Not a valid dollar amount." acknowledged onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} onAcknowledge={() => {}} />)
  expect(screen.getByTestId('field-acknowledged')).toBeInTheDocument()
  expect(screen.queryByTestId('field-warning')).toBeNull()
  expect(screen.getByRole('button', { name: /acknowledge/i })).toHaveAttribute('aria-pressed', 'true')
})
```

Run: `npx vitest run src/components/FieldRow.test.tsx`
Expected: FAIL (no acknowledge control / field-acknowledged).

- [ ] **Step 2: Add the acknowledge affordance to FieldRow**

In `src/components/FieldRow.tsx`:
- Add to `Props` (after `validationMessage?`): `acknowledged?: boolean` and (after `onConfirm`): `onAcknowledge?: () => void`.
- Update the destructure to include `acknowledged` and `onAcknowledge`.
- Replace the trailing `{flagged && ( ... )}` warning block with:

```tsx
      {flagged && (acknowledged ? (
        <div data-testid="field-acknowledged" className="flex items-center justify-between gap-2 bg-paper-2 px-3.5 pb-2.5 pt-1 text-[11px] text-muted lg:px-5 lg:text-xs">
          <span>Acknowledged as correct: {validationMessage}</span>
          {onAcknowledge && (
            <button type="button" aria-label={`Acknowledge ${field.label}`} aria-pressed={true}
              onClick={(e) => { e.stopPropagation(); onAcknowledge() }}
              className="shrink-0 rounded-[3px] border border-accent bg-accent px-2 py-0.5 text-white">
              Acknowledged ✓
            </button>
          )}
        </div>
      ) : (
        <div data-testid="field-warning" className="flex items-center justify-between gap-2 bg-flag-bg px-3.5 pb-2.5 pt-1 text-[11px] text-flag lg:px-5 lg:text-xs">
          <span className="flex items-start gap-1.5"><span aria-hidden="true">!</span><span>{validationMessage}</span></span>
          {onAcknowledge && (
            <button type="button" aria-label={`Acknowledge ${field.label}`} aria-pressed={false}
              onClick={(e) => { e.stopPropagation(); onAcknowledge() }}
              className="shrink-0 rounded-[3px] border border-flag bg-white px-2 py-0.5 text-flag">
              Mark correct as-is
            </button>
          )}
        </div>
      ))}
```

Run: `npx vitest run src/components/FieldRow.test.tsx`
Expected: PASS (the other FieldRow tests pass no `validationMessage`, so no acknowledge control renders, and `onAcknowledge` stays optional).

- [ ] **Step 3: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/components/FieldRow.tsx src/components/FieldRow.test.tsx
git commit -m "feat: FieldRow acknowledge-as-correct control and acknowledged treatment"
```

---

### Task 6: Review gated Next + live violations + acknowledge wiring (remove export dropdown)

**Files:**
- Modify: `src/pages/Review.tsx`, `src/pages/Review.test.tsx`

**Interfaces:**
- Consumes: `canBeReady`, `currentViolations`, `unreviewedCount`, `reviewSummary` (review.ts); `acknowledgeField` (context); `FieldRow` acknowledge props (Task 5).

- [ ] **Step 1: Update the failing Review tests**

In `src/pages/Review.test.tsx`:
- Add an `/export` route to the `renderAt` harness `Routes`:

```tsx
        <Routes>
          <Route path="/review/:id" element={<Review />} />
          <Route path="/export" element={<div>EXPORT PAGE</div>} />
        </Routes>
```

- Remove the `warns before exporting when fields are unreviewed` test and the `a failed doc does not render the Export control` test (the dropdown and soft warn are gone).
- Replace the `marking review does not flip a flagged, unresolved doc to Ready` test with:

```ts
test('marking review on a flagged doc shows a blocking banner and does not navigate', async () => {
  renderAt('/review/doc-jdoe')
  await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }))
  expect(screen.getByText(/not finished yet/i)).toBeInTheDocument()
  expect(screen.queryByText('EXPORT PAGE')).toBeNull()
  expect(screen.getByText('Needs review')).toBeInTheDocument()
})

test('marking review on a ready doc navigates to the export page', async () => {
  renderAt('/review/doc-acme')
  await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }))
  expect(screen.getByText('EXPORT PAGE')).toBeInTheDocument()
})
```

(Keep: not-found, highlight, guide-link, summary, and validation-warning tests.)

Run: `npx vitest run src/pages/Review.test.tsx`
Expected: FAIL (no banner / navigation yet; dropdown-removal not done).

- [ ] **Step 2: Rewrite Review's wiring**

In `src/pages/Review.tsx`:
- Imports: change line 1 to `import { useState } from 'react'`; line 2 to `import { Link, useParams, useNavigate } from 'react-router-dom'`; remove the `toJSON, toCSV, downloadFile` import; change the review import to `import { reviewSummary, unreviewedCount, canBeReady, currentViolations } from '../lib/review'`.
- Destructure: `const { getDocument, updateField, markReviewed, confirmField, acknowledgeField } = useDocuments()`.
- Remove `menuOpen`, `exportRef`, and the `useEffect` menu-close block. Add `const navigate = useNavigate()` and `const [blocked, setBlocked] = useState(false)`.
- Remove `baseName`, `canExport`, `confirmExport`. Change `messagesByField` to live recompute:

```ts
  const summary = reviewSummary(doc)
  const violations = currentViolations(doc)
  const messagesByField = new Map(violations.map((m) => [m.fieldKey, m.message]))
  const ackedKeys = new Set(doc.fields.filter((f) => f.acknowledged).map((f) => f.key))
```

- Replace the "Mark as reviewed" button's `onClick` with the gated Next:

```tsx
              onClick={() => {
                const willBeReady = doc.status === 'ready' || canBeReady(doc)
                markReviewed(doc.id)
                if (willBeReady) navigate('/export')
                else setBlocked(true)
              }}
```

- Delete the entire `{canExport && ( ... )}` Export dropdown block from the header.
- Add the blocking banner as the first child of `<main>` (before the status conditional):

```tsx
        {blocked && (
          <div className="mb-4 rounded-[3px] border border-flag/40 bg-flag-bg px-4 py-3 text-sm text-flag">
            <p className="font-semibold">This form is not finished yet.</p>
            {unreviewedCount(doc) > 0 && <p>{unreviewedCount(doc)} field(s) still need review. Confirm or correct them to finish.</p>}
            {violations.some((v) => !ackedKeys.has(v.fieldKey)) && <p>Resolve or acknowledge the flagged field before finishing.</p>}
          </div>
        )}
```

- In the `FieldRow` render, add the acknowledge props:

```tsx
                    validationMessage={messagesByField.get(f.key)}
                    acknowledged={f.acknowledged}
                    onAcknowledge={() => acknowledgeField(doc.id, f.key)}
```

Run: `npx vitest run src/pages/Review.test.tsx`
Expected: PASS.

- [ ] **Step 3: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/pages/Review.tsx src/pages/Review.test.tsx
git commit -m "feat: gated Next to export, live violations, acknowledge wiring; remove Review export dropdown"
```

---

### Task 7: ExportFormRow component (per-form audit row)

**Files:**
- Create: `src/components/ExportFormRow.tsx`, `src/components/ExportFormRow.test.tsx`

**Interfaces:**
- Consumes: `reviewSummary`, `currentViolations` (review.ts); `FormTypeBadge`.
- Produces: `ExportFormRow` default export, props `{ doc: Document; selected: boolean; onToggle: () => void }`.

- [ ] **Step 1: Write the failing ExportFormRow tests**

Create `src/components/ExportFormRow.test.tsx`:

```ts
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ExportFormRow from './ExportFormRow'
import type { Document, Field } from '../types'

const fld = (over: Partial<Field>): Field => ({
  key: 'wages', label: 'Wages', box: '1', value: '100.00', originalValue: '100.00',
  confidence: 0.95, type: 'currency', bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})
const doc = (fields: Field[]): Document => ({
  id: 'doc-x', filename: 'x.pdf', fileUrl: 'u', formType: 'W-2', status: 'ready',
  reviewedAt: '2026-02-11T00:00:00.000Z', fields,
})
const renderRow = (d: Document, selected = true) =>
  render(<MemoryRouter><ExportFormRow doc={d} selected={selected} onToggle={() => {}} /></MemoryRouter>)

test('shows filename, summary, and a Review link', () => {
  renderRow(doc([fld({})]))
  expect(screen.getByText('x.pdf')).toBeInTheDocument()
  expect(screen.getByText(/1 fields/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/review/doc-x')
})

test('lists a corrected field as was then now', () => {
  renderRow(doc([fld({ value: '150.00', originalValue: '100.00' })]))
  expect(screen.getByText(/was 100.00/)).toBeInTheDocument()
  expect(screen.getByText(/now 150.00/)).toBeInTheDocument()
})

test('lists an acknowledged violation', () => {
  renderRow(doc([
    fld({ key: 'socialSecurityWages', label: 'Social security wages', value: '60000.00', originalValue: '60000.00' }),
    fld({ key: 'socialSecurityTaxWithheld', label: 'Social security tax withheld', value: '3000.00', originalValue: '3000.00', acknowledged: true }),
  ]))
  expect(screen.getByText(/acknowledged by reviewer/i)).toBeInTheDocument()
})

test('shows no changes when nothing was corrected or acknowledged', () => {
  renderRow(doc([fld({})]))
  expect(screen.getByText('no changes')).toBeInTheDocument()
})

test('checkbox reflects selected and fires onToggle', async () => {
  const onToggle = vi.fn()
  render(<MemoryRouter><ExportFormRow doc={doc([fld({})])} selected={false} onToggle={onToggle} /></MemoryRouter>)
  const cb = screen.getByRole('checkbox')
  expect(cb).not.toBeChecked()
  await userEvent.click(cb)
  expect(onToggle).toHaveBeenCalled()
})
```

Run: `npx vitest run src/components/ExportFormRow.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `ExportFormRow.tsx`**

Create `src/components/ExportFormRow.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { Document } from '../types'
import FormTypeBadge from './FormTypeBadge'
import { reviewSummary, currentViolations } from '../lib/review'

export default function ExportFormRow({ doc, selected, onToggle }: { doc: Document; selected: boolean; onToggle: () => void }) {
  const summary = reviewSummary(doc)
  const corrected = doc.fields.filter((f) => f.value !== f.originalValue)
  const ackedKeys = new Set(doc.fields.filter((f) => f.acknowledged).map((f) => f.key))
  const acknowledged = currentViolations(doc).filter((v) => ackedKeys.has(v.fieldKey))
  const labelOf = (key: string) => doc.fields.find((f) => f.key === key)?.label ?? key
  const reviewedDate = doc.reviewedAt ? doc.reviewedAt.slice(0, 10) : ''
  const hasAudit = corrected.length > 0 || acknowledged.length > 0

  return (
    <div className="border-b border-border px-3.5 py-3 lg:px-5">
      <div className="flex items-center gap-3">
        <input type="checkbox" aria-label={`Select ${doc.filename}`} checked={selected} onChange={onToggle} />
        <span className="text-sm font-medium text-ink">{doc.filename}</span>
        <FormTypeBadge formType={doc.formType} />
        <span className="text-[11px] text-muted">reviewed {reviewedDate}</span>
        <Link to={`/review/${doc.id}`} className="ml-auto text-sm font-semibold text-ink underline underline-offset-2">
          Review →
        </Link>
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {summary.total} fields · {summary.confirmed} confirmed · {summary.corrected} corrected · {summary.remaining} to review
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {!hasAudit && <span>no changes</span>}
        {corrected.map((f) => (
          <div key={f.key}>{f.label}: was {f.originalValue} → now {f.value}</div>
        ))}
        {acknowledged.map((v) => (
          <div key={v.fieldKey}>{labelOf(v.fieldKey)}: {v.message}, acknowledged by reviewer</div>
        ))}
      </div>
    </div>
  )
}
```

Run: `npx vitest run src/components/ExportFormRow.test.tsx`
Expected: PASS.

- [ ] **Step 3: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/components/ExportFormRow.tsx src/components/ExportFormRow.test.tsx
git commit -m "feat: ExportFormRow with per-form audit of corrections and acknowledgments"
```

---

### Task 8: Export page + route + Home link + fixtures

**Files:**
- Create: `src/pages/Export.tsx`, `src/pages/Export.test.tsx`
- Modify: `src/App.tsx`, `src/pages/Home.tsx`, `src/pages/Home.test.tsx`, `src/fixtures.ts`

**Interfaces:**
- Consumes: `isOfficiallyReviewed` (review.ts), `toCombinedJSON`/`toCombinedCSV`/`downloadFile` (export.ts), `ExportFormRow` (Task 7), `useDocuments`.

- [ ] **Step 1: Seed two 1099 fixtures as reviewed**

In `src/fixtures.ts`, set `reviewedAt` on the nec and int entries (leave div null):

```ts
  { base: { id: 'doc-nec', filename: 'globex_1099nec.pdf', fileUrl: necPdf, mimeType: PDF, reviewedAt: '2026-03-12T10:00:00.000Z' }, result: asResult(nec) },
  { base: { id: 'doc-int', filename: 'firstnatl_1099int.pdf', fileUrl: intPdf, mimeType: PDF, reviewedAt: '2026-03-12T11:30:00.000Z' }, result: asResult(int) },
```

- [ ] **Step 2: Add the `/export` route and the Home Export link**

In `src/App.tsx`: add `import Export from './pages/Export'` and the route `<Route path="/export" element={<Export />} />`.

In `src/pages/Home.tsx`, replace the Guide link line with an Export link (taking `ml-auto`) followed by the Guide link:

```tsx
        <Link to="/export" className="ml-auto text-xs font-medium text-muted transition-colors hover:text-ink">
          Export
        </Link>
        <Link to="/guide" className="text-xs font-medium text-muted transition-colors hover:text-ink">
          Guide
        </Link>
```

- [ ] **Step 3: Write the failing Home + Export tests**

In `src/pages/Home.test.tsx`, add:

```ts
test('header has an Export link to the export page', () => {
  renderHome()
  expect(screen.getByRole('link', { name: 'Export' })).toHaveAttribute('href', '/export')
})
```

Create `src/pages/Export.test.tsx`:

```ts
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Export from './Export'
import { DocumentsProvider } from '../state/DocumentsContext'
import { downloadFile } from '../lib/export'

vi.mock('../lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/export')>()
  return { ...actual, downloadFile: vi.fn() }
})

const renderExport = () =>
  render(<DocumentsProvider><MemoryRouter><Export /></MemoryRouter></DocumentsProvider>)

test('lists only officially reviewed docs', () => {
  renderExport()
  expect(screen.getByText('acme_w2_2024.pdf')).toBeInTheDocument()
  expect(screen.getByText('smallco_w2.pdf')).toBeInTheDocument()
  expect(screen.getByText('globex_1099nec.pdf')).toBeInTheDocument()
  expect(screen.getByText('firstnatl_1099int.pdf')).toBeInTheDocument()
  expect(screen.queryByText('jdoe_w2_blurry.pdf')).toBeNull()
  expect(screen.queryByText('contoso_w2.pdf')).toBeNull()
  expect(screen.queryByText('vanguard_1099div.pdf')).toBeNull()
  expect(screen.queryByText('scan_2231.pdf')).toBeNull()
})

test('export is enabled by default and disabled when all deselected', async () => {
  renderExport()
  const exportBtn = screen.getByRole('button', { name: /export selected/i })
  expect(exportBtn).toBeEnabled()
  await userEvent.click(screen.getByRole('checkbox', { name: /select all/i }))
  expect(exportBtn).toBeDisabled()
})

test('choosing CSV triggers a combined download', async () => {
  renderExport()
  await userEvent.click(screen.getByRole('button', { name: /export selected/i }))
  await userEvent.click(screen.getByRole('button', { name: 'CSV' }))
  expect(downloadFile).toHaveBeenCalledWith('reviewed-forms.csv', 'text/csv', expect.any(String))
})
```

Run: `npx vitest run src/pages/Home.test.tsx src/pages/Export.test.tsx`
Expected: FAIL (Export module missing; Home Export link only after Step 2 lands, so this run validates both).

- [ ] **Step 4: Implement `Export.tsx`**

Create `src/pages/Export.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocuments } from '../state/DocumentsContext'
import ExportFormRow from '../components/ExportFormRow'
import { isOfficiallyReviewed } from '../lib/review'
import { toCombinedJSON, toCombinedCSV, downloadFile } from '../lib/export'

export default function Export() {
  const { documents } = useDocuments()
  const reviewed = documents.filter(isOfficiallyReviewed)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(reviewed.map((d) => d.id)))
  const [menuOpen, setMenuOpen] = useState(false)

  const allSelected = reviewed.length > 0 && reviewed.every((d) => selectedIds.has(d.id))
  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(reviewed.map((d) => d.id)))

  const selectedDocs = reviewed.filter((d) => selectedIds.has(d.id))
  const exportJSON = () => { downloadFile('reviewed-forms.json', 'application/json', toCombinedJSON(selectedDocs)); setMenuOpen(false) }
  const exportCSV = () => { downloadFile('reviewed-forms.csv', 'text/csv', toCombinedCSV(selectedDocs)); setMenuOpen(false) }

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border bg-white px-4 py-3">
        <Link to="/app" aria-label="Back to document list" className="rounded-[3px] border border-border bg-white px-2.5 py-1.5 text-sm">←</Link>
        <span className="text-sm font-semibold">Export reviewed forms</span>
        <div className="ml-auto flex items-center gap-3">
          {reviewed.length > 0 && (
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} />
              Select all
            </label>
          )}
          <div className="relative">
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="rounded-[3px] bg-accent px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Export selected ▾
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-32 rounded-[3px] border border-border bg-white py-1 shadow-sm">
                <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-2" onClick={exportJSON}>JSON</button>
                <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-2" onClick={exportCSV}>CSV</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {reviewed.length === 0 ? (
          <div className="py-16 text-center text-muted">
            <p>No reviewed forms yet. Review a document and mark it reviewed to export.</p>
            <Link to="/app" className="mt-2 inline-block font-semibold text-ink underline underline-offset-2">Back to documents</Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[3px] border border-border bg-white">
            {reviewed.map((d) => (
              <ExportFormRow key={d.id} doc={d} selected={selectedIds.has(d.id)} onToggle={() => toggle(d.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
```

Run: `npx vitest run src/pages/Home.test.tsx src/pages/Export.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/pages/Export.tsx src/pages/Export.test.tsx src/App.tsx src/pages/Home.tsx src/pages/Home.test.tsx src/fixtures.ts
git commit -m "feat: export/audit page, route, Home link, and reviewed 1099 fixtures"
```

---

## Final verification

- [ ] Run `npm test` (all green) and `npx tsc --noEmit` (no errors).
- [ ] Sanity: client bundle stays genai-free, no client-reachable file imports `extract/w2`, `extract/build`, or `extract/registry`. Verify: `grep -rn "extract/w2\|extract/build\|extract/registry" src/lib src/pages src/components src/state` returns nothing.

## Self-Review

1. **Spec coverage:** acknowledgeable gate (Tasks 1-3, 5, 6), live recompute (Tasks 1-2, 6, 7), confirm toggle (Task 3), long-format CSV + JSON array (Task 4), audit shows corrections AND acknowledgments (Task 7), gated Next + remove dropdown (Task 6), reviewed-only listing + select-all + reachability + fixtures (Task 8).
2. **Type consistency:** `crossChecksFor(formType) => (Field[]) => ValidationMessage[]` matches `currentViolations`. `canBeReady`/`isFieldReviewed`/`reviewSummary`/`isOfficiallyReviewed` signatures match call sites. `FieldRow` `onAcknowledge`/`acknowledged` optional; Review passes both. `ExportFormRow` props match Export usage.
3. **Flags:** jdoe is intentionally not seeded acknowledged (live demo); seeded ready docs (acme/smallco/nec/int) show "X to review" in their summary because individual fields were never confirmed, which is accurate and accepted.
