# Trust Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three model-independent trust signals to extraction (arithmetic + format cross-checks, per-field human review state, and source-highlight grace), plus the three W-2 fields the arithmetic check needs.

**Architecture:** The Document/Field/ExtractionResult contract is extended ADDITIVELY (new optional fields only). A new `crossChecks` member on `FormDefinition` runs semantic checks on the built `Field[]`; `buildDocument` runs it and adds a THIRD independent OR to the status decision. Per-field review state (`confirmed`) plus derived helpers drive a reconciled `markReviewed` and a soft export gate. Malformed bounding boxes degrade to a "source not located" state at render time via a shared pure predicate (numbers are not rewritten).

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + @testing-library/react (jsdom), Zod, Tailwind v4 (`@theme` tokens in `src/index.css`), Google GenAI SDK (mocked in tests).

## Global Constraints

- **No em dashes or en dashes** in any artifact (code, comments, copy, commits). Use a comma. Hard repo rule.
- **No `Co-Authored-By` trailer** on commits. Plain commit messages.
- **Contract is additive only**: add optional fields, remove/rename nothing. The built-`Field` shape stays exactly 8 keys (`bbox, box, confidence, key, label, originalValue, type, value`); `buildDocument` never sets `confirmed`.
- **Keep all existing tests green** unless a step deliberately updates one, with the reason noted.
- Test command (whole suite): `npm test` (runs `vitest run`). Single file: `npx vitest run <path>`.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- 1099 forms get NO new fields and NO arithmetic identities (format checks only).
- The eval (`scripts/eval/*`) is out of scope; its `SCORED_KEYS` is independent of `W2_FIELDS` and must stay at 7.

---

## File Structure

**New files:**
- `src/extract/checks.ts`: shared, form-agnostic format validators + `formatChecks`.
- `src/lib/review.ts`: derived review helpers (`isFieldReviewed`, `reviewSummary`, `unreviewedCount`, `canBeReady`).
- `src/lib/bbox.ts`: `isBBoxRenderable`, `locateField` (render-time bbox grace).
- Test files: `src/extract/checks.test.ts`, `src/lib/review.test.ts`, `src/lib/bbox.test.ts`.

**Modified files:**
- `src/types.ts`: `ValidationMessage`; optional `Field.confirmed`, `Document.validationMessages`, `ExtractionResult.validationMessages`.
- `src/extract/build.ts`: `buildDocument` widens (crossChecks param, returns `validationMessages`, third OR); seam comment.
- `src/extract/registry.ts`: optional `FormDefinition.crossChecks`.
- `src/extract/extract.ts`: thread `validationMessages` into the result.
- `src/lib/applyExtraction.ts`: carry `validationMessages`.
- `src/extract/w2.ts`: 3 new fields (3 places) + `w2CrossChecks` + `W2_FORM.crossChecks`.
- `src/extract/nec.ts`, `int.ts`, `div.ts`: `crossChecks: formatChecks`.
- `src/state/DocumentsContext.tsx`: `confirmField` action + reconciled `markReviewed`.
- `src/components/FieldRow.tsx`: confirm control, `was:` original, validation warning row.
- `src/pages/Review.tsx`: summary line, validation map, confirm wiring, export gate + warn.
- `src/components/DocumentViewer.tsx`: `sourceMissing` prop + note.
- `src/lib/export.ts`: `reviewed` CSV column.
- `src/index.css`: `--color-flag`, `--color-flag-bg` tokens.
- Fixtures: `src/fixtures/acme.json`, `jdoe.json`, `contoso.json`, `smallco.json`.
- Updated test files (deliberate ripple): `src/extract/w2.test.ts`, `build.test.ts`, `nec.test.ts`, `extract.test.ts`, `src/api/documents.test.ts`, `src/fixtures.test.ts`, `src/state/DocumentsContext.test.tsx`, `src/pages/Review.test.tsx`, `src/components/FieldRow.test.tsx`, `src/components/DocumentViewer.test.tsx`, `src/lib/applyExtraction.test.ts`, `src/lib/export.test.ts`.

---

## PHASE A: Validation foundation (server/contract)

### Task 1: Shared format checks + contract type additions

**Files:**
- Modify: `src/types.ts`
- Create: `src/extract/checks.ts`
- Test: `src/extract/checks.test.ts`

**Interfaces:**
- Produces: `ValidationMessage = { fieldKey: string; message: string }`; optional `Field.confirmed?: boolean`, `Document.validationMessages?: ValidationMessage[]`, `ExtractionResult.validationMessages?: ValidationMessage[]`.
- Produces: `looksLikeSSN(v): boolean`, `looksLikeEIN(v): boolean`, `looksLikeCurrency(v): boolean`, `parseAmount(v): number | null`, `formatChecks(fields: Field[]): ValidationMessage[]`.

- [ ] **Step 1: Add the additive contract types**

In `src/types.ts`, add after the existing `FieldType` line:

```ts
export type ValidationMessage = { fieldKey: string; message: string }
```

Add to the `Field` type (after `bbox: BBox`):

```ts
  confirmed?: boolean
```

Add to the `Document` type (after `reviewedAt: string | null`, before `error?`):

```ts
  validationMessages?: ValidationMessage[]
```

Add to the `ExtractionResult` type (after `detectedFormType: string`, before `error?`):

```ts
  validationMessages?: ValidationMessage[]
```

- [ ] **Step 2: Write the failing test for checks**

Create `src/extract/checks.test.ts`:

```ts
import { looksLikeSSN, looksLikeEIN, looksLikeCurrency, parseAmount, formatChecks } from './checks'
import type { Field } from '../types'

const f = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: '', originalValue: '', confidence: 0.95, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})

test('looksLikeSSN is mask-aware', () => {
  expect(looksLikeSSN('123-45-6789')).toBe(true)
  expect(looksLikeSSN('XXX-XX-1234')).toBe(true)
  expect(looksLikeSSN('123456789')).toBe(false)
  expect(looksLikeSSN('12-3')).toBe(false)
})

test('looksLikeEIN is mask-aware', () => {
  expect(looksLikeEIN('12-3456789')).toBe(true)
  expect(looksLikeEIN('XX-XXX6789')).toBe(true)
  expect(looksLikeEIN('123456789')).toBe(false)
})

test('parseAmount strips $ and commas, rejects junk', () => {
  expect(parseAmount('82,300.00')).toBe(82300)
  expect(parseAmount('$82300')).toBe(82300)
  expect(parseAmount('0.00')).toBe(0)
  expect(parseAmount('abc')).toBeNull()
  expect(looksLikeCurrency('1,000.00')).toBe(true)
  expect(looksLikeCurrency('N/A')).toBe(false)
})

test('formatChecks flags bad formats, skips empty values and text fields', () => {
  const fields = [
    f({ key: 'ssn', type: 'ssn', value: '12' }),
    f({ key: 'ein', type: 'ein', value: 'bad' }),
    f({ key: 'amt', type: 'currency', value: 'oops' }),
    f({ key: 'empty', type: 'ssn', value: '' }),
    f({ key: 'name', type: 'text', value: 'whatever' }),
    f({ key: 'okssn', type: 'ssn', value: '123-45-6789' }),
  ]
  const msgs = formatChecks(fields)
  expect(msgs.map((m) => m.fieldKey).sort()).toEqual(['amt', 'ein', 'ssn'])
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/extract/checks.test.ts`
Expected: FAIL with cannot find module `./checks`.

- [ ] **Step 4: Implement `checks.ts`**

Create `src/extract/checks.ts`:

```ts
import type { Field, ValidationMessage } from '../types'

const SSN_RE = /^[0-9Xx*]{3}-[0-9Xx*]{2}-[0-9Xx*]{4}$/
const EIN_RE = /^[0-9Xx*]{2}-[0-9Xx*]{7}$/

export function looksLikeSSN(value: string): boolean {
  return SSN_RE.test(value)
}

export function looksLikeEIN(value: string): boolean {
  return EIN_RE.test(value)
}

export function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function looksLikeCurrency(value: string): boolean {
  return parseAmount(value) !== null
}

// Form-agnostic format checks. Skips empty values (the empty-value status path
// handles those) and text fields. Reused by every form's crossChecks.
export function formatChecks(fields: Field[]): ValidationMessage[] {
  const messages: ValidationMessage[] = []
  for (const fld of fields) {
    if (fld.value === '') continue
    if (fld.type === 'ssn' && !looksLikeSSN(fld.value)) {
      messages.push({ fieldKey: fld.key, message: 'Not a valid SSN format (###-##-####).' })
    } else if (fld.type === 'ein' && !looksLikeEIN(fld.value)) {
      messages.push({ fieldKey: fld.key, message: 'Not a valid EIN format (##-#######).' })
    } else if (fld.type === 'currency' && !looksLikeCurrency(fld.value)) {
      messages.push({ fieldKey: fld.key, message: 'Not a valid dollar amount.' })
    }
  }
  return messages
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/extract/checks.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite (types must still compile + pass)**

Run: `npm test`
Expected: all pass (122 + 4 new).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/extract/checks.ts src/extract/checks.test.ts
git commit -m "feat: shared format checks and additive validation contract types"
```

---

### Task 2: buildDocument cross-checks plumbing + threading

**Files:**
- Modify: `src/extract/registry.ts`, `src/extract/build.ts:71-103`, `src/extract/extract.ts:54-56`, `src/lib/applyExtraction.ts`
- Test: `src/extract/build.test.ts`, `src/lib/applyExtraction.test.ts`

**Interfaces:**
- Consumes: `ValidationMessage` (Task 1).
- Produces: `buildDocument(parsed, formDef) -> { fields: Field[]; status: DocStatus; validationMessages: ValidationMessage[] }`; `FormDefinition.crossChecks?: (fields: Field[]) => ValidationMessage[]`.

- [ ] **Step 1: Add the optional `crossChecks` member to FormDefinition**

In `src/extract/registry.ts`, add the import and member. Change the imports block to include `Field` and `ValidationMessage`:

```ts
import type { FieldDef, Field, ValidationMessage } from '../types'
```

Add to the `FormDefinition` type (after `promptFragment: string`):

```ts
  crossChecks?: (fields: Field[]) => ValidationMessage[]
```

- [ ] **Step 2: Write the failing tests for buildDocument**

In `src/extract/build.test.ts`, add two tests at the end:

```ts
test('a non-empty crossChecks result forces needs_review independently of confidence', () => {
  const formDef = { fieldDefs: FIELDS, crossChecks: () => [{ fieldKey: 'a', message: 'bad' }] }
  const { status, validationMessages } = buildDocument({ isLegible: true, fields: ok() }, formDef)
  expect(status).toBe('needs_review')
  expect(validationMessages).toEqual([{ fieldKey: 'a', message: 'bad' }])
})

test('buildDocument returns an empty validationMessages when no crossChecks', () => {
  const { validationMessages } = buildDocument({ isLegible: true, fields: ok() }, { fieldDefs: FIELDS })
  expect(validationMessages).toEqual([])
})
```

(`ok()` here is all confident, non-empty, so without the crossChecks override the status would be `ready`; the first test proves the third OR is independent.)

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/extract/build.test.ts`
Expected: FAIL (`validationMessages` undefined; status `ready` not `needs_review`).

- [ ] **Step 4: Widen buildDocument**

In `src/extract/build.ts`, replace the `buildDocument` function (lines 69-103) with:

```ts
// Backend join. The model never generates the field constants. Identical join and
// status logic for every form, driven by formDef.fieldDefs. crossChecks (optional)
// runs semantic checks on the built fields and is an independent reason to review.
export function buildDocument(
  parsed: ParsedExtraction,
  formDef: { fieldDefs: readonly FieldDef[]; crossChecks?: (fields: Field[]) => ValidationMessage[] },
): { fields: Field[]; status: DocStatus; validationMessages: ValidationMessage[] } {
  const fields: Field[] = formDef.fieldDefs.map((f): Field => {
    const ex = parsed.fields[f.key]
    return {
      key: f.key,
      label: f.label,
      box: f.box,
      value: ex.value,
      originalValue: ex.value,
      confidence: ex.confidence,
      type: f.type,
      // bbox normalization seam: the prompt asks Gemini for 0 to 100 x/y/w/h, so this
      // is an identity pass-through today, UNVERIFIED (the eval has not run). Malformed
      // boxes degrade to a "source not located" state at render time (see lib/bbox.ts),
      // we do not rewrite numbers here. If an eval run shows a systematic space (for
      // example 0 to 1000), the real fix is a scaling transform HERE, shared by all
      // forms, so fixtures stay 0 to 100 and production matches.
      bbox: ex.bbox,
    }
  })

  const validationMessages = formDef.crossChecks ? formDef.crossChecks(fields) : []

  let status: DocStatus
  if (!parsed.isLegible) {
    status = 'failed'
  } else if (fields.some((f) => f.value === '' || f.confidence < 0.7) || validationMessages.length > 0) {
    // Three independent reasons to review: empty value, low confidence, or a failed
    // cross-check. The cross-check is NOT folded into the confidence test on purpose.
    status = 'needs_review'
  } else {
    status = 'ready'
  }

  return { fields, status, validationMessages }
}
```

Update the import on line 4 to include `ValidationMessage`:

```ts
import type { DocStatus, Field, FieldDef, ValidationMessage } from '../types'
```

- [ ] **Step 5: Run build tests**

Run: `npx vitest run src/extract/build.test.ts`
Expected: PASS (existing 3 + 2 new). The existing `{ fields, status }` destructures still work.

- [ ] **Step 6: Thread validationMessages through extract.ts**

In `src/extract/extract.ts`, replace lines 54-56 (the build + return) with:

```ts
    // 4. Join + status + cross-checks.
    const { fields, status, validationMessages } = buildDocument(parsed, formDef)
    const error = status === 'failed' ? `Detected ${formDef.formType}, could not extract it reliably.` : undefined
    return {
      fields,
      status,
      detectedFormType: formDef.formType,
      ...(validationMessages.length ? { validationMessages } : {}),
      ...(error ? { error } : {}),
    }
```

- [ ] **Step 7: Carry validationMessages in applyExtraction + write its test**

In `src/lib/applyExtraction.test.ts`, add at the end:

```ts
test('carries server validationMessages onto the document', () => {
  const result: ExtractionResult = {
    fields: [field('wages', 0.95)], status: 'needs_review', detectedFormType: 'W-2',
    validationMessages: [{ fieldKey: 'wages', message: 'Not a valid dollar amount.' }],
  }
  expect(applyExtraction(base, result).validationMessages).toEqual([
    { fieldKey: 'wages', message: 'Not a valid dollar amount.' },
  ])
})
```

Run: `npx vitest run src/lib/applyExtraction.test.ts`
Expected: FAIL (validationMessages undefined on the doc).

In `src/lib/applyExtraction.ts`, add to the returned object (after the `formType`/`status`/`fields` lines, alongside the existing `error` spread):

```ts
    ...(result.validationMessages ? { validationMessages: result.validationMessages } : {}),
```

Run: `npx vitest run src/lib/applyExtraction.test.ts`
Expected: PASS (existing 4 + 1 new). The existing `toEqual` ready test has no validationMessages, so the key is omitted and the assertion still matches.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: all pass. extract.test.ts is unaffected (W-2 still 7 fields, no crossChecks yet, empty validationMessages omitted).

- [ ] **Step 9: Commit**

```bash
git add src/extract/registry.ts src/extract/build.ts src/extract/build.test.ts src/extract/extract.ts src/lib/applyExtraction.ts src/lib/applyExtraction.test.ts
git commit -m "feat: buildDocument runs optional crossChecks as an independent review trigger"
```

---

### Task 3: W-2 field set extension + W-2 cross-checks + fixtures

**Files:**
- Modify: `src/extract/w2.ts`
- Test/update: `src/extract/w2.test.ts`, `src/extract/extract.test.ts`, `src/api/documents.test.ts`, `src/fixtures.test.ts`
- Modify (fixtures): `src/fixtures/acme.json`, `jdoe.json`, `contoso.json`, `smallco.json`

**Interfaces:**
- Consumes: `formatChecks`, `parseAmount` (Task 1); `buildDocument` (Task 2).
- Produces: `W2_FIELDS` with 10 entries; `w2CrossChecks(fields: Field[]): ValidationMessage[]`; `W2_FORM.crossChecks = w2CrossChecks`.

- [ ] **Step 1: Write the failing W-2 cross-check tests**

In `src/extract/w2.test.ts`, change the import line 1 to add `w2CrossChecks`:

```ts
import { buildW2Document, w2CrossChecks, W2_FIELDS, type W2Extraction } from './w2'
```

Replace `okFields` (lines 10-18) so it includes the three new fields with consistent values (socialSecurityWages is 60000.00, so ss tax = 3720.00, medicare tax on 60000 = 870.00):

```ts
const okFields = (): W2Extraction['fields'] => ({
  wages: ex('58500.00', 0.97),
  federalWithholding: ex('7920.00', 0.96),
  socialSecurityWages: ex('60000.00', 0.95),
  socialSecurityTaxWithheld: ex('3720.00', 0.95),
  medicareWages: ex('60000.00', 0.95),
  medicareTaxWithheld: ex('870.00', 0.95),
  employerEIN: ex('94-2719303', 0.93),
  employeeSSN: ex('532-19-7766', 0.94),
  employeeName: ex('Jordan A. Reyes', 0.9),
  employerName: ex('Northwind Logistics LLC', 0.91),
})
```

Change the two length assertions `expect(fields).toHaveLength(7)` (lines 29 and 65) to `toHaveLength(10)`.

Add these tests at the end of the file:

```ts
test('w2CrossChecks returns no messages for arithmetic-consistent fields', () => {
  const { fields } = buildW2Document(extraction(true, okFields()))
  expect(w2CrossChecks(fields)).toEqual([])
})

test('w2CrossChecks flags social security tax that is off by more than the tolerance', () => {
  const f = okFields()
  f.socialSecurityTaxWithheld = ex('3000.00', 0.95) // expected 3720.00
  const { fields } = buildW2Document(extraction(true, f))
  const msgs = w2CrossChecks(fields)
  expect(msgs).toHaveLength(1)
  expect(msgs[0].fieldKey).toBe('socialSecurityTaxWithheld')
})

test('w2CrossChecks skips an identity when an operand is empty', () => {
  const f = okFields()
  f.socialSecurityWages = ex('', 0.95)
  const { fields } = buildW2Document(extraction(true, f))
  expect(w2CrossChecks(fields).some((m) => m.fieldKey === 'socialSecurityTaxWithheld')).toBe(false)
})

test('status is needs_review when a cross-check fails even at high confidence', () => {
  const f = okFields()
  f.medicareTaxWithheld = ex('5000.00', 0.99) // expected 870.00, high confidence
  expect(buildW2Document(extraction(true, f)).status).toBe('needs_review')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/extract/w2.test.ts`
Expected: FAIL (`w2CrossChecks` not exported; length 7 not 10; TS shape of `okFields` mismatched).

- [ ] **Step 3: Extend `w2.ts` (all three places) and add `w2CrossChecks`**

In `src/extract/w2.ts`:

(a) Update imports (lines 1-4):

```ts
import { z } from 'zod'
import { buildDocument, buildFormSchemas, Extracted } from './build'
import { formatChecks, parseAmount } from './checks'
import type { FormDefinition } from './registry'
import type { DocStatus, Field, FieldDef, ValidationMessage } from '../types'
```

(b) Insert the three field entries into `W2_FIELDS` after the `socialSecurityWages` line (line 10):

```ts
  { key: 'socialSecurityTaxWithheld', box: '4', label: 'Social security tax withheld', type: 'currency' },
  { key: 'medicareWages', box: '5', label: 'Medicare wages and tips', type: 'currency' },
  { key: 'medicareTaxWithheld', box: '6', label: 'Medicare tax withheld', type: 'currency' },
```

(c) Insert three lines into `W2_PROMPT_FRAGMENT` after the `socialSecurityWages` line:

```
- socialSecurityTaxWithheld: Box 4, "Social security tax withheld". Currency.
- medicareWages: Box 5, "Medicare wages and tips". Currency.
- medicareTaxWithheld: Box 6, "Medicare tax withheld". Currency.
```

(d) Insert three keys into the `W2Extraction` Zod object's `fields` after `socialSecurityWages: Extracted,`:

```ts
    socialSecurityTaxWithheld: Extracted,
    medicareWages: Extracted,
    medicareTaxWithheld: Extracted,
```

(e) Add `w2CrossChecks` and wire it into `W2_FORM`. Add this function above `W2_FORM` (after the `w2Schemas` const):

```ts
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
```

Add `crossChecks: w2CrossChecks` to `W2_FORM` (after `promptFragment: W2_PROMPT_FRAGMENT,`):

```ts
  crossChecks: w2CrossChecks,
```

- [ ] **Step 4: Run W-2 tests**

Run: `npx vitest run src/extract/w2.test.ts`
Expected: PASS. The frozen-shape `Object.keys` assertion still holds (8 keys; `buildDocument` does not add `confirmed`). The `W2_FIELDS` key-order assertion derives from `W2_FIELDS`, so it self-updates.

- [ ] **Step 5: Update extract.test.ts W-2 payload + count**

In `src/extract/extract.test.ts`, in the first test (W-2), replace the `fields` object (lines 39-43) with the 10-field, arithmetic-consistent payload, and change the count assertion on line 48 to `toHaveLength(10)`:

```ts
    fields: {
      wages: ex('58500.00'), federalWithholding: ex('7920.00'), socialSecurityWages: ex('60000.00'),
      socialSecurityTaxWithheld: ex('3720.00'), medicareWages: ex('60000.00'), medicareTaxWithheld: ex('870.00'),
      employerEIN: ex('94-2719303'), employeeSSN: ex('532-19-7766'), employeeName: ex('Jordan A. Reyes'),
      employerName: ex('Northwind Logistics LLC'),
    },
```

Run: `npx vitest run src/extract/extract.test.ts`
Expected: PASS (W-2 stays `ready`: arithmetic consistent, formats valid; 1099 tests unchanged).

- [ ] **Step 6: Update the api/documents FAKE payload + count**

In `src/api/documents.test.ts`, replace the hoisted `FAKE` block (lines 4-14) with a per-field, valid, arithmetic-consistent W-2 payload:

```ts
const { FAKE } = vi.hoisted(() => {
  const values: Record<string, string> = {
    wages: '1000.00', federalWithholding: '100.00', socialSecurityWages: '1000.00',
    socialSecurityTaxWithheld: '62.00', medicareWages: '1000.00', medicareTaxWithheld: '14.50',
    employerEIN: '12-3456789', employeeSSN: '123-45-6789', employeeName: 'Jordan Reyes', employerName: 'Northwind LLC',
  }
  return {
    FAKE: {
      detectedFormType: 'W-2',
      isLegible: true,
      fields: Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, { value: v, confidence: 0.95, bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 } }]),
      ),
    },
  }
})
```

Change the field-count assertion on line 43 to `toHaveLength(10)`.

Run: `npx vitest run src/api/documents.test.ts`
Expected: PASS (status `ready`: 62.00 = 1000 x 0.062, 14.50 = 1000 x 0.0145, valid EIN/SSN; stateless assertions unchanged).

- [ ] **Step 7: Update fixtures.test.ts counts + key order**

In `src/fixtures.test.ts`:
- Line 13: change the W-2 count `'W-2': 7` to `'W-2': 10`.
- Line 23: change `expect(nr.fields).toHaveLength(7)` to `toHaveLength(10)`.
- Lines 35-37: change the W-2 key-order list to include the three new keys in box order:

```ts
  expect(nr.fields.map((f) => f.key)).toEqual([
    'wages', 'federalWithholding', 'socialSecurityWages', 'socialSecurityTaxWithheld', 'medicareWages',
    'medicareTaxWithheld', 'employerEIN', 'employeeSSN', 'employeeName', 'employerName',
  ])
```

(Do not run yet; the fixtures must be updated first, next step.)

- [ ] **Step 8: Add the three fields to each W-2 fixture**

In each of `acme.json`, `jdoe.json`, `contoso.json`, `smallco.json`, insert three field objects **immediately after the `socialSecurityWages` field object** (after its closing `},`, before the `employerEIN` object). Use these per-fixture values (all arithmetic-consistent except jdoe, which is the validation demo). bboxes are within 0 to 100.

`acme.json` (socialSecurityWages 84000.00 -> ss tax 5208.00, medicare on 84000 -> 1218.00):

```json
    {
      "key": "socialSecurityTaxWithheld",
      "label": "Social security tax withheld",
      "box": "4",
      "value": "5208.00",
      "originalValue": "5208.00",
      "confidence": 0.97,
      "type": "currency",
      "bbox": { "page": 1, "x": 74.44, "y": 22.09, "w": 19.35, "h": 3.49 }
    },
    {
      "key": "medicareWages",
      "label": "Medicare wages and tips",
      "box": "5",
      "value": "84000.00",
      "originalValue": "84000.00",
      "confidence": 0.96,
      "type": "currency",
      "bbox": { "page": 1, "x": 54.28, "y": 29.06, "w": 19.67, "h": 3.49 }
    },
    {
      "key": "medicareTaxWithheld",
      "label": "Medicare tax withheld",
      "box": "6",
      "value": "1218.00",
      "originalValue": "1218.00",
      "confidence": 0.95,
      "type": "currency",
      "bbox": { "page": 1, "x": 74.44, "y": 29.06, "w": 19.35, "h": 3.49 }
    },
```

`smallco.json` (socialSecurityWages 45000.00 -> 2790.00; medicare on 45000 -> 652.50):

```json
    {
      "key": "socialSecurityTaxWithheld",
      "label": "Social security tax withheld",
      "box": "4",
      "value": "2790.00",
      "originalValue": "2790.00",
      "confidence": 0.94,
      "type": "currency",
      "bbox": { "page": 1, "x": 74.44, "y": 22.09, "w": 19.35, "h": 3.49 }
    },
    {
      "key": "medicareWages",
      "label": "Medicare wages and tips",
      "box": "5",
      "value": "45000.00",
      "originalValue": "45000.00",
      "confidence": 0.93,
      "type": "currency",
      "bbox": { "page": 1, "x": 54.28, "y": 29.06, "w": 19.67, "h": 3.49 }
    },
    {
      "key": "medicareTaxWithheld",
      "label": "Medicare tax withheld",
      "box": "6",
      "value": "652.50",
      "originalValue": "652.50",
      "confidence": 0.92,
      "type": "currency",
      "bbox": { "page": 1, "x": 74.44, "y": 29.06, "w": 19.35, "h": 3.49 }
    },
```

`contoso.json` (needs_review by confidence; new fields consistent and high-confidence so no extra violation. socialSecurityWages 77000.00 -> 4774.00; medicare on 77000 -> 1116.50):

```json
    {
      "key": "socialSecurityTaxWithheld",
      "label": "Social security tax withheld",
      "box": "4",
      "value": "4774.00",
      "originalValue": "4774.00",
      "confidence": 0.92,
      "type": "currency",
      "bbox": { "page": 1, "x": 74.44, "y": 22.09, "w": 19.35, "h": 3.49 }
    },
    {
      "key": "medicareWages",
      "label": "Medicare wages and tips",
      "box": "5",
      "value": "77000.00",
      "originalValue": "77000.00",
      "confidence": 0.9,
      "type": "currency",
      "bbox": { "page": 1, "x": 54.28, "y": 29.06, "w": 19.67, "h": 3.49 }
    },
    {
      "key": "medicareTaxWithheld",
      "label": "Medicare tax withheld",
      "box": "6",
      "value": "1116.50",
      "originalValue": "1116.50",
      "confidence": 0.9,
      "type": "currency",
      "bbox": { "page": 1, "x": 74.44, "y": 29.06, "w": 19.35, "h": 3.49 }
    },
```

`jdoe.json` (the validation demo; socialSecurityWages 62000.00 expects ~3844.00, but Box 4 reads 3500.00 at HIGH confidence 0.9, so the cross-check, not confidence, flags it; medicare on 62000 -> 899.00 consistent):

```json
    {
      "key": "socialSecurityTaxWithheld",
      "label": "Social security tax withheld",
      "box": "4",
      "value": "3500.00",
      "originalValue": "3500.00",
      "confidence": 0.9,
      "type": "currency",
      "bbox": { "page": 1, "x": 74.44, "y": 22.09, "w": 19.35, "h": 3.49 }
    },
    {
      "key": "medicareWages",
      "label": "Medicare wages and tips",
      "box": "5",
      "value": "62000.00",
      "originalValue": "62000.00",
      "confidence": 0.92,
      "type": "currency",
      "bbox": { "page": 1, "x": 54.28, "y": 29.06, "w": 19.67, "h": 3.49 }
    },
    {
      "key": "medicareTaxWithheld",
      "label": "Medicare tax withheld",
      "box": "6",
      "value": "899.00",
      "originalValue": "899.00",
      "confidence": 0.92,
      "type": "currency",
      "bbox": { "page": 1, "x": 74.44, "y": 29.06, "w": 19.35, "h": 3.49 }
    },
```

Then, in `jdoe.json` only, add a top-level `validationMessages` array. Change the opening so the object starts:

```json
{
  "status": "needs_review",
  "detectedFormType": "W-2",
  "validationMessages": [
    {
      "fieldKey": "socialSecurityTaxWithheld",
      "message": "Box 4 social security tax should be about 6.2% of Box 3 social security wages (expected 3844.00, got 3500.00)."
    }
  ],
  "fields": [
```

- [ ] **Step 9: Run fixtures + the full suite**

Run: `npx vitest run src/fixtures.test.ts`
Expected: PASS (W-2 now 10 fields; all bboxes within 0 to 100; jdoe is the first needs_review with the 10-key order).

Run: `npm test`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/extract/w2.ts src/extract/w2.test.ts src/extract/extract.test.ts src/api/documents.test.ts src/fixtures.test.ts src/fixtures/acme.json src/fixtures/jdoe.json src/fixtures/contoso.json src/fixtures/smallco.json
git commit -m "feat: add W-2 boxes 4-6 and payroll-tax cross-checks end to end"
```

---

### Task 4: 1099 forms get format-only cross-checks

**Files:**
- Modify: `src/extract/nec.ts`, `src/extract/int.ts`, `src/extract/div.ts`
- Test: `src/extract/nec.test.ts`

**Interfaces:**
- Consumes: `formatChecks` (Task 1).
- Produces: `NEC_FORM.crossChecks = formatChecks`, same for INT and DIV.

- [ ] **Step 1: Write the failing NEC format-check test**

In `src/extract/nec.test.ts`, add `buildDocument`/`NEC_FORM` are already imported. Add at the end:

```ts
test('a malformed payer TIN flags needs_review via format checks', () => {
  const bad = { ...necFields(), payerTIN: ex('1234', 0.95) }
  expect(buildDocument({ isLegible: true, fields: bad }, NEC_FORM).status).toBe('needs_review')
})
```

Run: `npx vitest run src/extract/nec.test.ts`
Expected: FAIL (status `ready`, no crossChecks wired yet).

- [ ] **Step 2: Wire crossChecks into the three 1099 forms**

In `src/extract/nec.ts`: add `import { formatChecks } from './checks'` to the imports, and add `crossChecks: formatChecks,` to `NEC_FORM` (after `promptFragment`).

In `src/extract/int.ts`: add `import { formatChecks } from './checks'`, and add `crossChecks: formatChecks,` to `INT_FORM`.

In `src/extract/div.ts`: add `import { formatChecks } from './checks'`, and add `crossChecks: formatChecks,` to `DIV_FORM`.

- [ ] **Step 3: Run the 1099 suites**

Run: `npx vitest run src/extract/nec.test.ts src/extract/int.test.ts src/extract/div.test.ts`
Expected: PASS. Existing 1099 values are valid formats (TINs and currencies), so attaching `formatChecks` adds no violations; the new NEC test now flags the bad TIN.

- [ ] **Step 4: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/extract/nec.ts src/extract/int.ts src/extract/div.ts src/extract/nec.test.ts
git commit -m "feat: format-only cross-checks for 1099-NEC, 1099-INT, 1099-DIV"
```

---

## PHASE B: Review state + UI

### Task 5: Review helpers + confirmField + reconciled markReviewed

**Files:**
- Create: `src/lib/review.ts`, `src/lib/review.test.ts`
- Modify: `src/state/DocumentsContext.tsx`
- Update: `src/state/DocumentsContext.test.tsx`, `src/pages/Review.test.tsx`

**Interfaces:**
- Produces: `isFieldReviewed(field): boolean`, `reviewSummary(doc): { total, confirmed, corrected, remaining }`, `unreviewedCount(doc): number`, `canBeReady(doc): boolean`; `DocumentsContextValue.confirmField(docId, key): void`.

- [ ] **Step 1: Write the failing review-helpers test**

Create `src/lib/review.test.ts`:

```ts
import { isFieldReviewed, reviewSummary, unreviewedCount, canBeReady } from './review'
import type { Document, Field } from '../types'

const fld = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: 'v', originalValue: 'v', confidence: 0.95, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})
const doc = (fields: Field[], validationMessages?: Document['validationMessages']): Document => ({
  id: 'd', filename: 'f', fileUrl: 'u', formType: 'W-2', status: 'needs_review', reviewedAt: null, fields,
  ...(validationMessages ? { validationMessages } : {}),
})

test('isFieldReviewed: confirmed OR edited, not mere default', () => {
  expect(isFieldReviewed(fld({ confirmed: true }))).toBe(true)
  expect(isFieldReviewed(fld({ value: 'x', originalValue: 'y' }))).toBe(true)
  expect(isFieldReviewed(fld({}))).toBe(false)
})

test('reviewSummary counts corrected, confirmed, remaining', () => {
  const s = reviewSummary(doc([
    fld({ key: 'a', value: 'x', originalValue: 'y' }), // corrected
    fld({ key: 'b', confirmed: true }),                // confirmed unchanged
    fld({ key: 'c' }),                                 // remaining
    fld({ key: 'd' }),                                 // remaining
  ]))
  expect(s).toEqual({ total: 4, confirmed: 1, corrected: 1, remaining: 2 })
  expect(unreviewedCount(doc([fld({}), fld({ confirmed: true })]))).toBe(1)
})

test('canBeReady requires all fields resolved and no violations', () => {
  expect(canBeReady(doc([fld({ confirmed: true }), fld({ value: 'x', originalValue: 'y' })]))).toBe(true)
  expect(canBeReady(doc([fld({ confirmed: true }), fld({})]))).toBe(false)
  expect(canBeReady(doc([fld({ confirmed: true })], [{ fieldKey: 'k', message: 'bad' }]))).toBe(false)
})
```

Run: `npx vitest run src/lib/review.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `review.ts`**

Create `src/lib/review.ts`:

```ts
import type { Document, Field } from '../types'

// A field is reviewed when a human confirmed it or edited it. Selection/focus alone
// does not count (that is tracked transiently in the page, not on the field).
export function isFieldReviewed(field: Field): boolean {
  return field.confirmed === true || field.value !== field.originalValue
}

export function reviewSummary(doc: Document): { total: number; confirmed: number; corrected: number; remaining: number } {
  let confirmed = 0
  let corrected = 0
  let remaining = 0
  for (const f of doc.fields) {
    if (f.value !== f.originalValue) corrected++
    else if (f.confirmed === true) confirmed++
    else remaining++
  }
  return { total: doc.fields.length, confirmed, corrected, remaining }
}

export function unreviewedCount(doc: Document): number {
  return reviewSummary(doc).remaining
}

// A document earns ready only when every field is reviewed and no validation
// failures remain. Drives the reconciled markReviewed and is independent of model
// confidence.
export function canBeReady(doc: Document): boolean {
  const allResolved = doc.fields.every(isFieldReviewed)
  const hasViolations = (doc.validationMessages?.length ?? 0) > 0
  return allResolved && !hasViolations
}
```

Run: `npx vitest run src/lib/review.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing DocumentsContext tests**

In `src/state/DocumentsContext.test.tsx`:

(a) Add `confirmField` to the destructure on line 18:

```ts
  const { documents, batch, addDocuments, updateField, markReviewed, confirmField } = useDocuments()
```

(b) Add to the Harness JSX (after the existing `review` button on line 29):

```tsx
      <button onClick={() => confirmField('doc-jdoe', 'wages')}>confirm</button>
      <span data-testid="jdoe-wages-confirmed">
        {String(documents.find((d) => d.id === 'doc-jdoe')?.fields.find((f) => f.key === 'wages')?.confirmed ?? false)}
      </span>
      <span data-testid="jdoe-reviewedAt">{documents.find((d) => d.id === 'doc-jdoe')?.reviewedAt ?? ''}</span>
```

(c) Replace the existing `markReviewed flips status to ready` test (lines 95-99) with:

```ts
test('confirmField marks a field confirmed', () => {
  setup()
  act(() => { screen.getByText('confirm').click() })
  expect(screen.getByTestId('jdoe-wages-confirmed').textContent).toBe('true')
})

test('markReviewed stamps reviewedAt but will not force ready when unresolved or flagged', () => {
  setup()
  expect(screen.getByTestId('jdoe-reviewedAt').textContent).toBe('')
  act(() => { screen.getByText('review').click() })
  expect(screen.getByTestId('jdoe-status').textContent).toBe('needs_review')
  expect(screen.getByTestId('jdoe-reviewedAt').textContent).not.toBe('')
})
```

Run: `npx vitest run src/state/DocumentsContext.test.tsx`
Expected: FAIL (`confirmField` not on the context; old markReviewed still forces `ready`).

- [ ] **Step 4: Implement confirmField + reconcile markReviewed**

In `src/state/DocumentsContext.tsx`:

(a) Add the import:

```ts
import { canBeReady } from '../lib/review'
```

(b) Add `confirmField` to the `DocumentsContextValue` type (after `updateField`):

```ts
  confirmField(docId: string, key: string): void
```

(c) Add the `confirmField` callback (after `updateField`, before `markReviewed`):

```ts
  const confirmField = useCallback((docId: string, key: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, confirmed: true } : f)) } : d,
      ),
    )
  }, [])
```

(d) Replace `markReviewed` (lines 82-86) with the reconciled version:

```ts
  const markReviewed = useCallback((docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id !== docId) return d
        // reviewedAt is always stamped (a human looked at this). Status only becomes
        // ready when the doc has actually earned it: all fields reviewed, no violations.
        return { ...d, status: canBeReady(d) ? 'ready' : d.status, reviewedAt: new Date().toISOString() }
      }),
    )
  }, [])
```

(e) Add `confirmField` to the `value` memo object and its dependency array:

```ts
  const value = useMemo(
    () => ({ documents, batch, addDocuments, updateField, confirmField, markReviewed, getDocument }),
    [documents, batch, addDocuments, updateField, confirmField, markReviewed, getDocument],
  )
```

Run: `npx vitest run src/state/DocumentsContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update the Review markReviewed test (behavior ripple)**

In `src/pages/Review.test.tsx`, replace the `mark as reviewed flips the status pill to Ready` test (lines 34-38) with:

```ts
test('marking review does not flip a flagged, unresolved doc to Ready', async () => {
  renderAt('/review/doc-jdoe')
  await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }))
  expect(screen.getByText('Needs review')).toBeInTheDocument()
})
```

Run: `npx vitest run src/pages/Review.test.tsx`
Expected: PASS (jdoe has a validation violation + unreviewed fields, so it stays `needs_review`).

- [ ] **Step 6: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/lib/review.ts src/lib/review.test.ts src/state/DocumentsContext.tsx src/state/DocumentsContext.test.tsx src/pages/Review.test.tsx
git commit -m "feat: per-field confirm and a markReviewed that no longer fakes ready"
```

---

### Task 6: FieldRow confirm control, original value, validation warning

**Files:**
- Modify: `src/components/FieldRow.tsx`, `src/index.css`, `src/pages/Review.tsx` (onConfirm wiring only)
- Update: `src/components/FieldRow.test.tsx`

**Interfaces:**
- Consumes: `isFieldReviewed` (Task 5).
- Produces: `FieldRow` props gain `validationMessage?: string` and `onConfirm: () => void`.

- [ ] **Step 1: Add the flag color tokens**

In `src/index.css`, add to the `@theme` block (after `--color-failed-bg`):

```css
  --color-flag: #b4341c;
  --color-flag-bg: #fdeceb;
```

- [ ] **Step 2: Write the failing FieldRow tests**

In `src/components/FieldRow.test.tsx`, update the four existing render calls to pass `onConfirm={() => {}}` (add it to each `<FieldRow ... />`). Then add:

```ts
test('confirm control fires onConfirm and does not select the row', async () => {
  const onConfirm = vi.fn()
  const onSelect = vi.fn()
  render(<FieldRow field={base} selected={false} onSelect={onSelect} onChange={() => {}} onConfirm={onConfirm} />)
  await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
  expect(onConfirm).toHaveBeenCalled()
  expect(onSelect).not.toHaveBeenCalled()
})

test('an edited field shows the original value and reads as reviewed', () => {
  render(<FieldRow field={{ ...base, value: '61,000.00' }} selected={false} onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} />)
  expect(screen.getByText(/was:\s*60,000\.00/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /confirm/i })).toHaveAttribute('aria-pressed', 'true')
})

test('a confirmed field reads as reviewed', () => {
  render(<FieldRow field={{ ...base, confirmed: true }} selected={false} onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} />)
  expect(screen.getByRole('button', { name: /confirm/i })).toHaveAttribute('aria-pressed', 'true')
})

test('renders a validation warning', () => {
  render(<FieldRow field={base} selected={false} validationMessage="Not a valid dollar amount." onSelect={() => {}} onChange={() => {}} onConfirm={() => {}} />)
  expect(screen.getByTestId('field-warning')).toHaveTextContent('Not a valid dollar amount.')
})
```

Run: `npx vitest run src/components/FieldRow.test.tsx`
Expected: FAIL (no confirm button, no `was:`, no `field-warning`).

- [ ] **Step 3: Rewrite FieldRow**

Replace `src/components/FieldRow.tsx` with:

```tsx
import type { Field } from '../types'
import ConfidenceIndicator from './ConfidenceIndicator'
import { confidenceTier } from '../lib/format'
import { isFieldReviewed } from '../lib/review'

type Props = {
  field: Field
  selected: boolean
  validationMessage?: string
  onSelect: () => void
  onChange: (value: string) => void
  onConfirm: () => void
}

export default function FieldRow({ field, selected, validationMessage, onSelect, onChange, onConfirm }: Props) {
  const low = confidenceTier(field.confidence) === 'low'
  const edited = field.value !== field.originalValue
  const reviewed = isFieldReviewed(field)
  const flagged = !!validationMessage

  const rowCls = [
    'flex items-center gap-3 px-3.5 py-2.5 cursor-pointer lg:gap-4 lg:px-5 lg:py-3.5',
    selected
      ? 'bg-accent/10 shadow-[inset_3px_0_0_var(--color-accent)]'
      : flagged
        ? 'bg-flag-bg shadow-[inset_3px_0_0_var(--color-flag)]'
        : low
          ? 'bg-review-row'
          : 'bg-white',
  ].join(' ')

  return (
    <div className="border-b border-border">
      <div className={rowCls} onClick={onSelect}>
        <div className="w-[150px] shrink-0 lg:w-[210px]">
          <div className="text-xs font-medium text-ink lg:text-sm">
            {field.label}
            {edited && <span className="ml-1 text-[10px] italic text-muted lg:text-xs">· edited</span>}
          </div>
          {field.box && <div className="text-[10px] text-muted lg:text-xs">Box {field.box}</div>}
          {edited && (
            <div className="text-[10px] text-muted lg:text-xs" title={`Original AI value: ${field.originalValue}`}>
              was: {field.originalValue}
            </div>
          )}
        </div>
        <input
          className={`flex-1 rounded-[3px] border bg-white px-2.5 py-1.5 text-xs tabular-nums text-ink outline-none focus:border-accent lg:px-3 lg:py-2.5 lg:text-base ${low ? 'border-review-line' : 'border-border'}`}
          value={field.value}
          aria-label={field.label}
          onFocus={onSelect}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={`Confirm ${field.label}`}
          aria-pressed={reviewed}
          onClick={(e) => { e.stopPropagation(); onConfirm() }}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-[3px] border text-xs ${reviewed ? 'border-accent bg-accent text-white' : 'border-border bg-white text-muted'}`}
        >
          ✓
        </button>
        <ConfidenceIndicator confidence={field.confidence} />
      </div>
      {flagged && (
        <div data-testid="field-warning" className="flex items-start gap-1.5 bg-flag-bg px-3.5 pb-2.5 text-[11px] text-flag lg:px-5 lg:text-xs">
          <span aria-hidden="true">!</span>
          <span>{validationMessage}</span>
        </div>
      )}
    </div>
  )
}
```

Run: `npx vitest run src/components/FieldRow.test.tsx`
Expected: PASS.

- [ ] **Step 4: Wire onConfirm in Review (keep types consistent)**

In `src/pages/Review.tsx`, add `confirmField` to the context destructure (line 13):

```ts
  const { getDocument, updateField, markReviewed, confirmField } = useDocuments()
```

In the `doc.fields.map(...)` FieldRow render (around line 117-124), add the `onConfirm` prop:

```tsx
                    onChange={(value) => updateField(doc.id, f.key, value)}
                    onConfirm={() => confirmField(doc.id, f.key)}
```

Run: `npx vitest run src/pages/Review.test.tsx`
Expected: PASS (no new assertions; the confirm control renders and wires).

- [ ] **Step 5: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/components/FieldRow.tsx src/components/FieldRow.test.tsx src/index.css src/pages/Review.tsx
git commit -m "feat: FieldRow confirm control, original-value display, validation warning row"
```

---

### Task 7: Review summary, validation messages, soft export gate

**Files:**
- Modify: `src/pages/Review.tsx`
- Update: `src/pages/Review.test.tsx`

**Interfaces:**
- Consumes: `reviewSummary`, `unreviewedCount` (Task 5); `FieldRow.validationMessage` (Task 6).

- [ ] **Step 1: Write the failing Review tests**

In `src/pages/Review.test.tsx`, add:

```ts
test('shows the per-field review summary', () => {
  renderAt('/review/doc-jdoe')
  expect(screen.getByText(/10 fields/i)).toBeInTheDocument()
  expect(screen.getByText(/to review/i)).toBeInTheDocument()
})

test('warns before exporting when fields are unreviewed', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderAt('/review/doc-jdoe')
  await userEvent.click(screen.getByRole('button', { name: /export/i }))
  await userEvent.click(screen.getByRole('button', { name: 'CSV' }))
  expect(confirmSpy).toHaveBeenCalled()
  confirmSpy.mockRestore()
})

test('a failed doc does not render the Export control', () => {
  renderAt('/review/doc-scan')
  expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
})

test('renders a validation warning for a flagged field', () => {
  renderAt('/review/doc-jdoe')
  expect(screen.getByTestId('field-warning')).toBeInTheDocument()
})
```

Run: `npx vitest run src/pages/Review.test.tsx`
Expected: FAIL (no summary text, Export present on failed doc, no warn, no field-warning wired).

- [ ] **Step 2: Implement summary, message map, export gate**

In `src/pages/Review.tsx`:

(a) Update imports: add review helpers and `ValidationMessage` is not needed; add:

```ts
import { reviewSummary, unreviewedCount } from '../lib/review'
```

(b) After `const baseName = ...` (line 42), add the summary, the message map, and the export guard:

```ts
  const summary = reviewSummary(doc)
  const messagesByField = new Map((doc.validationMessages ?? []).map((m) => [m.fieldKey, m.message]))
  const canExport = doc.status === 'ready' || doc.status === 'needs_review'
  const confirmExport = () => {
    const n = unreviewedCount(doc)
    return n === 0 || window.confirm(`${n} fields haven't been reviewed, export anyway?`)
  }
```

(c) Gate the Export control: wrap the `<div className="relative" ref={exportRef}>...</div>` block in `{canExport && ( ... )}`.

(d) Add the guard to both export handlers. The JSON button onClick becomes:

```tsx
                  onClick={() => { if (!confirmExport()) return; downloadFile(`${baseName}.json`, 'application/json', toJSON(doc)); setMenuOpen(false) }}
```

The CSV button onClick becomes:

```tsx
                  onClick={() => { if (!confirmExport()) return; downloadFile(`${baseName}.csv`, 'text/csv', toCSV(doc)); setMenuOpen(false) }}
```

(e) Replace the Fields section-header `<div>` (the one reading `Fields · {doc.fields.length} extracted`) with a two-line header carrying the summary:

```tsx
              <div className="border-b border-border bg-paper-2 px-3 py-2 lg:px-4 lg:py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted lg:text-xs">Fields</div>
                <div className="mt-0.5 text-[11px] font-normal normal-case text-muted">
                  {summary.total} fields · {summary.confirmed} confirmed · {summary.corrected} corrected · {summary.remaining} to review
                </div>
              </div>
```

(f) Pass the per-field validation message into FieldRow (in the `doc.fields.map`):

```tsx
                    validationMessage={messagesByField.get(f.key)}
```

Run: `npx vitest run src/pages/Review.test.tsx`
Expected: PASS.

- [ ] **Step 3: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/pages/Review.tsx src/pages/Review.test.tsx
git commit -m "feat: review summary, per-field validation messages, soft export gate"
```

---

## PHASE C: Source-highlight grace

### Task 8: bbox predicate + DocumentViewer grace + seam comment

**Files:**
- Create: `src/lib/bbox.ts`, `src/lib/bbox.test.ts`
- Modify: `src/components/DocumentViewer.tsx`, `src/pages/Review.tsx`
- Update: `src/components/DocumentViewer.test.tsx`

**Interfaces:**
- Produces: `isBBoxRenderable(b: BBox): boolean`; `locateField(field: Field): { highlight: BBox | null; sourceMissing: boolean }`; `DocumentViewer` gains `sourceMissing?: boolean`.

- [ ] **Step 1: Write the failing bbox tests**

Create `src/lib/bbox.test.ts`:

```ts
import { isBBoxRenderable, locateField } from './bbox'
import type { Field } from '../types'

const fld = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: '100.00', originalValue: '100.00', confidence: 0.95, type: 'currency',
  bbox: { page: 1, x: 10, y: 10, w: 20, h: 5 }, ...over,
})

test('isBBoxRenderable: in-range true, empty box false, overflow/negative false', () => {
  expect(isBBoxRenderable({ page: 1, x: 10, y: 10, w: 20, h: 5 })).toBe(true)
  expect(isBBoxRenderable({ page: 1, x: 0, y: 0, w: 0, h: 0 })).toBe(false)
  expect(isBBoxRenderable({ page: 1, x: 90, y: 10, w: 20, h: 5 })).toBe(false) // x+w > 100
  expect(isBBoxRenderable({ page: 1, x: -1, y: 10, w: 5, h: 5 })).toBe(false)
})

test('locateField: value-bearing + renderable -> highlight', () => {
  const r = locateField(fld({}))
  expect(r.highlight).toEqual({ page: 1, x: 10, y: 10, w: 20, h: 5 })
  expect(r.sourceMissing).toBe(false)
})

test('locateField: value-bearing + bad bbox -> sourceMissing', () => {
  const r = locateField(fld({ bbox: { page: 1, x: 200, y: 10, w: 20, h: 5 } }))
  expect(r.highlight).toBeNull()
  expect(r.sourceMissing).toBe(true)
})

test('locateField: empty value -> no-op', () => {
  const r = locateField(fld({ value: '', bbox: { page: 1, x: 0, y: 0, w: 0, h: 0 } }))
  expect(r.highlight).toBeNull()
  expect(r.sourceMissing).toBe(false)
})
```

Run: `npx vitest run src/lib/bbox.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `bbox.ts`**

Create `src/lib/bbox.ts`:

```ts
import type { BBox, Field } from '../types'

const EPS = 0.5 // tolerate edge rounding on the page bounds

// A bbox is renderable only if it sits inside the 0 to 100 page space. {0,0,0,0}
// (an empty field's box) is not renderable, which is correct: nothing to draw.
export function isBBoxRenderable(b: BBox): boolean {
  return (
    Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h) &&
    b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 &&
    b.x + b.w <= 100 + EPS && b.y + b.h <= 100 + EPS
  )
}

// Render-time grace for the unverified bbox pass-through. A value-bearing field with
// an unusable bbox degrades to "source not located" rather than drawing off canvas.
// An empty field is a no-op (no highlight, no warning).
export function locateField(field: Field): { highlight: BBox | null; sourceMissing: boolean } {
  if (field.value === '') return { highlight: null, sourceMissing: false }
  if (isBBoxRenderable(field.bbox)) return { highlight: field.bbox, sourceMissing: false }
  return { highlight: null, sourceMissing: true }
}
```

Run: `npx vitest run src/lib/bbox.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing DocumentViewer test**

In `src/components/DocumentViewer.test.tsx`, add:

```ts
test('shows a source-not-located note when sourceMissing and no highlight', () => {
  render(<DocumentViewer fileUrl="/w2.png" mimeType="image/png" highlight={null} sourceMissing />)
  expect(screen.getByTestId('source-missing')).toBeInTheDocument()
  expect(screen.queryByTestId('bbox-highlight')).toBeNull()
})
```

Run: `npx vitest run src/components/DocumentViewer.test.tsx`
Expected: FAIL (no `source-missing` testid; prop unknown).

- [ ] **Step 4: Implement DocumentViewer grace**

In `src/components/DocumentViewer.tsx`:

(a) Widen the Props type:

```ts
type Props = { fileUrl: string; mimeType?: string; highlight: BBox | null; sourceMissing?: boolean }
```

(b) Update the signature destructure:

```ts
export default function DocumentViewer({ fileUrl, mimeType, highlight, sourceMissing }: Props) {
```

(c) After the existing `{highlight && ( ... )}` block (before the closing `</div>`), add:

```tsx
      {!highlight && sourceMissing && (
        <div
          data-testid="source-missing"
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-flag-bg/90 px-3 py-1.5 text-center text-[11px] font-medium text-flag"
        >
          Source not located on the page
        </div>
      )}
```

Run: `npx vitest run src/components/DocumentViewer.test.tsx`
Expected: PASS (existing overlay tests unaffected: they pass in-range `highlight` and no `sourceMissing`).

- [ ] **Step 5: Wire grace into Review**

In `src/pages/Review.tsx`:

(a) Add the import:

```ts
import { locateField } from '../lib/bbox'
```

(b) Replace the `highlight` computation (lines 40-41) with:

```ts
  const selectedField = doc.fields.find((f) => f.key === selectedKey) ?? null
  const located = selectedField ? locateField(selectedField) : { highlight: null, sourceMissing: false }
```

(c) Update the `DocumentViewer` usage to pass both:

```tsx
                <DocumentViewer fileUrl={doc.fileUrl} mimeType={doc.mimeType} highlight={located.highlight} sourceMissing={located.sourceMissing} />
```

Remove the now-unused `import type { BBox } from '../types'` if nothing else uses it (it does not after this change).

Run: `npx vitest run src/pages/Review.test.tsx`
Expected: PASS (the existing "highlights the clicked field" test selects a value-bearing, in-range W-2 field, so `located.highlight` is set and the overlay renders).

- [ ] **Step 6: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/lib/bbox.ts src/lib/bbox.test.ts src/components/DocumentViewer.tsx src/components/DocumentViewer.test.tsx src/pages/Review.tsx
git commit -m "feat: degrade malformed bounding boxes to a source-not-located state"
```

(The build.ts seam comment was already updated in Task 2; no further change needed here.)

---

## PHASE D: Export

### Task 9: CSV gains a `reviewed` column

**Files:**
- Modify: `src/lib/export.ts`
- Update: `src/lib/export.test.ts`

**Interfaces:**
- Consumes: `isFieldReviewed` (Task 5).

- [ ] **Step 1: Update the failing export test**

In `src/lib/export.test.ts`, update the CSV test assertions (lines 23-25):

```ts
  expect(lines[0]).toBe('key,label,box,value,originalValue,confidence,type,reviewed')
  expect(lines[1]).toBe('wages,"Wages, tips, other comp.",1,"60,000.00","60,000.00",0.98,currency,false')
  expect(lines[2]).toBe('employer,"Employer, Inc.",c,"A, B Co","A, B Co",0.9,text,false')
```

Run: `npx vitest run src/lib/export.test.ts`
Expected: FAIL (header and rows lack the `reviewed` column).

- [ ] **Step 2: Add the column**

In `src/lib/export.ts`:

(a) Add the import:

```ts
import { isFieldReviewed } from './review'
```

(b) Widen `csvCell` to accept booleans (line 7):

```ts
function csvCell(value: string | number | boolean): string {
```

(c) Update `toCSV`:

```ts
export function toCSV(doc: Document): string {
  const header = ['key', 'label', 'box', 'value', 'originalValue', 'confidence', 'type', 'reviewed']
  const rows = doc.fields.map((f) =>
    [f.key, f.label, f.box, f.value, f.originalValue, f.confidence, f.type, isFieldReviewed(f)].map(csvCell).join(','),
  )
  return [header.join(','), ...rows].join('\n')
}
```

Run: `npx vitest run src/lib/export.test.ts`
Expected: PASS (both synthetic fields are unedited and unconfirmed, so `reviewed` is `false`). `toJSON` round-trip test is unaffected.

- [ ] **Step 3: Full suite + commit**

Run: `npm test`
Expected: all pass.

```bash
git add src/lib/export.ts src/lib/export.test.ts
git commit -m "feat: CSV export carries the per-field reviewed flag"
```

---

## Final verification

- [ ] **Run the whole suite one more time**

Run: `npm test`
Expected: all green. The count is the original 122 plus the net new tests (checks 4, build +2, applyExtraction +1, w2 +4, nec +1, review 3, bbox 4, DocumentViewer +1, FieldRow +4, Review +4, DocumentsContext net change), minus the deliberately replaced markReviewed tests. Every change is intentional and noted in the per-task steps.

- [ ] **Type-check the build** (catches any prop/type drift not caught by vitest)

Run: `npx tsc --noEmit` (or `npm run build` if that is the project's type-gate)
Expected: no errors.

---

## Self-review (run after the plan is executed)

1. **Spec coverage**, Decision 1: Task 3 (3 fields in all three places, fixtures, ripple). Decision 2: Tasks 1-4 (checks, buildDocument third OR, threading, W-2 arithmetic, 1099 format-only, FieldRow warning). Decision 3: Tasks 5-7 + 9 (confirmField, reconciled markReviewed, summary, soft export gate + failed guard, original-value display, reviewed column). Decision 4: Task 8 (predicate, grace, seam comment in Task 2). Contract additive: Task 1.
2. **Type consistency**, `crossChecks: (fields: Field[]) => ValidationMessage[]` is identical in `registry.ts`, `build.ts`, and the W-2/1099 forms. `buildDocument` returns `{ fields, status, validationMessages }` everywhere. `isFieldReviewed`/`canBeReady`/`reviewSummary`/`unreviewedCount` signatures match their call sites. `FieldRow` `onConfirm` is required and wired in Review; `validationMessage` optional.
3. **Known flags to confirm with the user**: the `reviewed` CSV column (deliberate reading of the recon's CSV-header-test ripple); the extraction-time-snapshot limitation of `validationMessages` (no recompute on edit); the bbox seam scaling fix gated on an eval run.
