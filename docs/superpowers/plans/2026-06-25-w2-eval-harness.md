# W-2 Extraction Stress-Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, locally-run accuracy/eval harness that synthesizes a clean W-2 with known ground truth, generates degraded variants one axis at a time, runs each through the real `extractW2` production path against the live Gemini API, and emits a per-condition accuracy table.

**Architecture:** Three runnable scripts under `scripts/eval/` (`make-w2.ts` fills and renders the IRS fillable W-2 plus per-scenario ground truth; `degrade.ts` produces image and layout variants from the clean render; `run.ts` orchestrates generation, calls the SAME `extractW2`, scores field by field, and writes the table). All comparison and normalization logic lives in small pure modules (`normalize.ts`, `score.ts`, `groundtruth.ts`) that are unit-tested in Vitest. The live-API run and image generation are manual and never wired into `npm test` or CI.

**Tech Stack:** TypeScript run via `vite-node`; `pdf-lib` (fill plus flatten the IRS AcroForm), `pdf-to-img` (render the flattened PDF to PNG), `sharp` (raster degradations), `@napi-rs/canvas` (perspective warp, redaction, ADP-style re-render), `@faker-js/faker` (plausible data), Vitest (pure-logic tests only).

## Global Constraints

These apply to every task. Exact values copied from the spec and repo memory.

- The harness calls the SAME production extraction code: import `extractW2` from `src/extract/w2.ts`. Never fork or reimplement it.
- The harness must NOT modify any production code path. bbox normalization stays inside `buildW2Document`; the harness only READS bboxes to sanity-check them.
- If the harness reveals a production bug (for example Gemini returns 0 to 1000 bboxes instead of 0 to 100), STOP and report it in the output. Do not silently patch around it in the script.
- Only the pure-logic modules get Vitest tests (zero API, zero PDF, zero sharp/canvas). The live run (`run.ts`) and image generation (`make-w2.ts`, `degrade.ts`) stay manual. Do NOT add live-API calls to the unit test suite or CI.
- Package manager is `npm`. Scripts run via `npx vite-node scripts/eval/<file>.ts`.
- The extractor produces EXACTLY 7 scored fields, in this order: `wages` (box 1, currency), `federalWithholding` (box 2, currency), `socialSecurityWages` (box 3, currency), `employerEIN` (box b, ein), `employeeSSN` (box a, ssn), `employeeName` (box e, text), `employerName` (box c, text). Field-by-field scoring covers only these 7. The PDF is filled with more boxes for realism, but only these 7 are scored.
- Currency/SSN/EIN/text normalization mirrors the production prompt rules (currency strips `$` and thousands separators and keeps cents exactly as printed; SSN is `###-##-####` preserving any mask; EIN is `##-#######`; text is verbatim). Ground truth is authored in that exact normalized form.
- Use obviously-fake SSNs only (start `123-45-67`, e.g. `123-45-6789`). Never emit a real-format-plausible SSN.
- No em dashes or en dashes in any file, comment, or commit message. Use a comma. (Repo memory: hard rule.)
- No `Co-Authored-By` trailer on commits. (Repo memory: this repo omits coauthors.)
- The user provides `scripts/eval/assets/fw2.pdf` (irs.gov/pub/irs-pdf/fw2.pdf) and runs the live eval with `GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts`.

---

## File Structure

```
scripts/eval/
  assets/.gitkeep            committed; fw2.pdf is placed here by the user (gitignored)
  out/                       generated artifacts (gitignored): pngs, per-variant ground-truth json, manifest
  types.ts                   shared types (GroundTruth, FieldGT, FormData, Layout, manifest entry)
  normalize.ts               PURE: currency/ssn/ein/text normalization mirroring the prompt
  groundtruth.ts             PURE: faker-seeded scenarios (clean, zero_withholding, masked_ssn, large_values)
  score.ts                   PURE: scoreField, bboxOk, scoreVariant, renderResultsTable
  make-w2.ts                 fill + flatten fw2.pdf, render scenario PNGs, capture field layout rects
  degrade.ts                 derive image/layout/content variants from the clean render
  run.ts                     orchestrate generation + extractW2 + scoring + results.md table
  normalize.test.ts          Vitest (pure)
  groundtruth.test.ts        Vitest (pure)
  score.test.ts              Vitest (pure)
  results.md                 committed seed placeholder, overwritten by the live run
  README.md                  how to run, FIELD_MAP discovery, invariants
```

Responsibility split: pure scoring math is isolated from the heavy native libs so its tests load nothing but the function under test. `make-w2.ts` owns the only PDF dependency. `degrade.ts` owns the only sharp/canvas dependency. `run.ts` owns the only live-API dependency.

---

### Task 1: Scaffolding, dependencies, gitignore

**Files:**
- Modify: `package.json` (add devDependencies and convenience scripts)
- Modify: `.gitignore` (ignore generated output and the user-supplied PDF)
- Create: `scripts/eval/assets/.gitkeep`
- Create: `scripts/eval/results.md` (seed placeholder)
- Create: `scripts/eval/README.md`

**Interfaces:**
- Produces: the `scripts/eval/` directory, installed libs (`pdf-lib`, `pdf-to-img`, `sharp`, `@napi-rs/canvas`, `@faker-js/faker`), and npm aliases `eval:make`, `eval:degrade`, `eval:run`.

- [ ] **Step 1: Install dev dependencies**

```bash
cd /home/andresl/Projects/taxform_automation
npm install -D pdf-lib@^1.17.1 pdf-to-img@^4.4.0 sharp@^0.34.5 @napi-rs/canvas@^0.1.65 @faker-js/faker@^9.3.0
```

Expected: install completes; `sharp` and `@napi-rs/canvas` pull prebuilt binaries (no node-gyp). `sharp` is already listed under `allowScripts` in `package.json`.

- [ ] **Step 2: Add convenience scripts to `package.json`**

In the `"scripts"` block, after the existing `"capture-fixtures"` line, add:

```json
    "eval:make": "vite-node scripts/eval/make-w2.ts",
    "eval:degrade": "vite-node scripts/eval/degrade.ts",
    "eval:run": "vite-node scripts/eval/run.ts"
```

- [ ] **Step 3: Update `.gitignore`**

Append these lines to `.gitignore`:

```
scripts/eval/out/
scripts/eval/assets/fw2.pdf
```

- [ ] **Step 4: Create the assets keep-file**

```bash
mkdir -p scripts/eval/assets scripts/eval/out
touch scripts/eval/assets/.gitkeep
```

- [ ] **Step 5: Create the seed results placeholder**

Create `scripts/eval/results.md`:

```markdown
# W-2 Extraction Eval Results

Seed placeholder. Run the live eval to populate this file:

```
GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts
```

The runner overwrites this file with the per-variant accuracy table.
Rows are variants, columns are per-field pass/fail plus bbox-ok, mean confidence,
overall pass rate, and document status.
```

- [ ] **Step 6: Create the README**

Create `scripts/eval/README.md`:

```markdown
# W-2 extraction stress-test harness

Standalone accuracy/eval harness. It hits the LIVE Gemini API through the SAME
production `extractW2` path. It is NOT part of the unit suite and is not wired
into CI. Run it locally with a real key.

## One-time setup

1. Download the official IRS fillable W-2 from https://www.irs.gov/pub/irs-pdf/fw2.pdf
   and save it as `scripts/eval/assets/fw2.pdf` (gitignored).
2. Confirm the AcroForm field names match `FIELD_MAP` in `make-w2.ts`:

   ```
   DUMP_FIELDS=1 npx vite-node scripts/eval/make-w2.ts
   ```

   This prints every fillable field name and exits. If `make-w2.ts` later stops
   with "FIELD_MAP names not found", reconcile `FIELD_MAP` against this list
   (the IRS form repeats fields per copy; use the page-1 copy names).

## Run the full eval

```
GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts
```

This generates the clean render plus all variants into `scripts/eval/out/`,
runs each through `extractW2`, and writes the accuracy table to
`scripts/eval/results.md` and the console. Set `SKIP_GEN=1` to reuse an existing
`out/` instead of regenerating images.

## Pure-logic tests (safe, no API)

```
npm test
```

`normalize.test.ts`, `score.test.ts`, and `groundtruth.test.ts` run here. They
never touch the API, the PDF, or sharp/canvas.

## Invariants

- The harness only READS bboxes. bbox normalization stays in `buildW2Document`.
- If a bbox comes back out of the 0 to 100 range, that is flagged loudly as a
  possible production bug. The harness does not patch around it.
- Content edge cases score the RIGHT behavior: an empty, low-confidence answer
  where the spec demands it is a pass. A plausible hallucinated value is a fail.
```

- [ ] **Step 7: Verify the repo is still green and builds**

```bash
npm test
npm run build
```

Expected: existing suite passes (no new tests yet), build succeeds. The new scripts are under `scripts/`, which `tsconfig.json` (`include: ["src"]`) does not typecheck, so the build is unaffected.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore scripts/eval/assets/.gitkeep scripts/eval/results.md scripts/eval/README.md
git commit -m "chore: scaffold W-2 eval harness deps, scripts, and gitignore"
```

---

### Task 2: Pure normalization module

**Files:**
- Create: `scripts/eval/normalize.ts`
- Test: `scripts/eval/normalize.test.ts`

**Interfaces:**
- Consumes: `FieldType` (type-only) from `src/types.ts`.
- Produces: `normalizeCurrency(v)`, `normalizeSsn(v)`, `normalizeEin(v)`, `normalizeText(v)`, `normalizeByType(type, v)`, all `(string) => string`.

- [ ] **Step 1: Write the failing test**

Create `scripts/eval/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeCurrency,
  normalizeSsn,
  normalizeEin,
  normalizeText,
  normalizeByType,
} from './normalize'

describe('normalizeCurrency', () => {
  it('strips dollar sign and thousands separators, keeps printed cents', () => {
    expect(normalizeCurrency('$84,200.00')).toBe('84200.00')
    expect(normalizeCurrency('84,200.00')).toBe('84200.00')
    expect(normalizeCurrency('1,234,567.89')).toBe('1234567.89')
  })
  it('does not invent or drop cents', () => {
    expect(normalizeCurrency('84200')).toBe('84200')
  })
  it('returns empty for empty', () => {
    expect(normalizeCurrency('')).toBe('')
  })
})

describe('normalizeSsn / normalizeEin', () => {
  it('preserves an SSN mask and uppercases it', () => {
    expect(normalizeSsn('xxx-xx-1234')).toBe('XXX-XX-1234')
    expect(normalizeSsn(' 123-45-6789 ')).toBe('123-45-6789')
  })
  it('trims an EIN', () => {
    expect(normalizeEin(' 12-3456789 ')).toBe('12-3456789')
  })
})

describe('normalizeText', () => {
  it('trims and collapses internal whitespace, keeps case', () => {
    expect(normalizeText('  Acme   Corp ')).toBe('Acme Corp')
  })
})

describe('normalizeByType', () => {
  it('dispatches by field type', () => {
    expect(normalizeByType('currency', '$1,000.00')).toBe('1000.00')
    expect(normalizeByType('ssn', 'xxx-xx-1234')).toBe('XXX-XX-1234')
    expect(normalizeByType('ein', ' 12-3456789 ')).toBe('12-3456789')
    expect(normalizeByType('text', '  a  b ')).toBe('a b')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/eval/normalize.test.ts`
Expected: FAIL with "Cannot find module './normalize'".

- [ ] **Step 3: Write the implementation**

Create `scripts/eval/normalize.ts`:

```ts
import type { FieldType } from '../../src/types'

// Mirrors the production prompt's value-formatting rules so ground truth and
// model output compare on equal footing. The harness does no extra rounding.

export function normalizeCurrency(v: string): string {
  // Strip the dollar sign and thousands separators (commas, spaces). Keep the
  // decimal point and digits exactly as printed. Do not add or drop cents.
  return v.replace(/[$,\s]/g, '').trim()
}

export function normalizeSsn(v: string): string {
  // Compared as printed. Uppercase any mask characters so "xxx" equals "XXX".
  return v.trim().toUpperCase()
}

export function normalizeEin(v: string): string {
  return v.trim().toUpperCase()
}

export function normalizeText(v: string): string {
  // Verbatim except surrounding whitespace and collapsed internal whitespace runs.
  return v.trim().replace(/\s+/g, ' ')
}

export function normalizeByType(type: FieldType, v: string): string {
  switch (type) {
    case 'currency':
      return normalizeCurrency(v)
    case 'ssn':
      return normalizeSsn(v)
    case 'ein':
      return normalizeEin(v)
    case 'text':
      return normalizeText(v)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/eval/normalize.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/normalize.ts scripts/eval/normalize.test.ts
git commit -m "feat: pure currency/ssn/ein/text normalization for the eval harness"
```

---

### Task 3: Shared types and ground-truth generation

**Files:**
- Create: `scripts/eval/types.ts`
- Create: `scripts/eval/groundtruth.ts`
- Test: `scripts/eval/groundtruth.test.ts`

**Interfaces:**
- Consumes: `FieldType` (type-only) from `src/types.ts`; `@faker-js/faker`.
- Produces:
  - Types: `FieldGT`, `GroundTruth`, `FormData`, `LayoutRect`, `Layout`, `VariantManifestEntry`.
  - `type Scenario = 'clean' | 'zero_withholding' | 'masked_ssn' | 'large_values'`.
  - `makeScenario(scenario: Scenario, seed: number): { formData: FormData; groundTruth: GroundTruth }`.
  - `SCORED_KEYS: (keyof FormData)[]` (the 7 scored keys, in field order).

- [ ] **Step 1: Create the shared types**

Create `scripts/eval/types.ts`:

```ts
import type { FieldType } from '../../src/types'

// Ground truth for one scored field.
export type FieldGT = {
  key: string
  box: string
  type: FieldType
  printed: string // exactly what is rendered on the form ("" if the box is blank)
  expected: string // the normalized value the extractor SHOULD return
  expectEmpty: boolean // true => correct behavior is an empty value (anti-hallucination)
}

// All scored fields for one variant, in field order.
export type GroundTruth = {
  scenario: string
  fields: Record<string, FieldGT>
}

// Everything written into the PDF for a render scenario. Superset of scored fields.
export type FormData = {
  wages: string
  federalWithholding: string
  socialSecurityWages: string
  employerEIN: string
  employeeSSN: string
  employeeName: string
  employerName: string
  // supporting fields for realism, not scored
  employeeAddress: string
  employerAddress: string
  controlNumber: string
  socialSecurityTaxWithheld: string
  medicareWages: string
  medicareTaxWithheld: string
  stateCode: string
  stateWages: string
  stateTax: string
}

// Pixel rectangle of a field's value on the rendered clean PNG (for redaction).
export type LayoutRect = { x: number; y: number; w: number; h: number }
export type Layout = Record<string, LayoutRect>

// One row to score: an image plus its ground truth.
export type VariantManifestEntry = {
  variant: string
  image: string // filename in out/
  mime: 'image/png' | 'image/jpeg'
  groundtruth: string // filename in out/
}
```

- [ ] **Step 2: Write the failing test**

Create `scripts/eval/groundtruth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeScenario, SCORED_KEYS } from './groundtruth'

describe('makeScenario', () => {
  it('produces all 7 scored fields in field order', () => {
    const { groundTruth } = makeScenario('clean', 1)
    expect(Object.keys(groundTruth.fields)).toEqual([
      'wages',
      'federalWithholding',
      'socialSecurityWages',
      'employerEIN',
      'employeeSSN',
      'employeeName',
      'employerName',
    ])
    expect(SCORED_KEYS).toHaveLength(7)
  })

  it('only emits obviously-fake SSNs', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { groundTruth } = makeScenario('clean', seed)
      expect(groundTruth.fields.employeeSSN.printed).toMatch(/^123-45-67\d{2}$/)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = makeScenario('clean', 7)
    const b = makeScenario('clean', 7)
    expect(a.groundTruth).toEqual(b.groundTruth)
    expect(a.formData).toEqual(b.formData)
  })

  it('zero_withholding leaves box 2 blank and expects empty', () => {
    const { formData, groundTruth } = makeScenario('zero_withholding', 2)
    expect(formData.federalWithholding).toBe('')
    expect(groundTruth.fields.federalWithholding.expectEmpty).toBe(true)
    expect(groundTruth.fields.federalWithholding.expected).toBe('')
  })

  it('masked_ssn prints a mask and expects the mask preserved, not empty', () => {
    const { groundTruth } = makeScenario('masked_ssn', 3)
    const ssn = groundTruth.fields.employeeSSN
    expect(ssn.printed).toMatch(/^XXX-XX-\d{4}$/)
    expect(ssn.expected).toBe(ssn.printed)
    expect(ssn.expectEmpty).toBe(false)
  })

  it('large_values prints comma-formatted amounts and expects them stripped', () => {
    const { groundTruth } = makeScenario('large_values', 4)
    expect(groundTruth.fields.wages.printed).toContain(',')
    expect(groundTruth.fields.wages.expected).toBe('1234567.89')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/eval/groundtruth.test.ts`
Expected: FAIL with "Cannot find module './groundtruth'".

- [ ] **Step 4: Write the implementation**

Create `scripts/eval/groundtruth.ts`:

```ts
import { faker } from '@faker-js/faker'
import type { FieldType } from '../../src/types'
import type { FieldGT, FormData, GroundTruth } from './types'

export type Scenario = 'clean' | 'zero_withholding' | 'masked_ssn' | 'large_values'

// The 7 scored keys, in the same order as W2_FIELDS in src/extract/w2.ts.
export const SCORED_KEYS: (keyof FormData)[] = [
  'wages',
  'federalWithholding',
  'socialSecurityWages',
  'employerEIN',
  'employeeSSN',
  'employeeName',
  'employerName',
]

// Obvious-fake SSN: always starts 123-45-67, never a plausible real SSN.
function fakeSsn(): string {
  const last2 = faker.number.int({ min: 0, max: 99 }).toString().padStart(2, '0')
  return `123-45-67${last2}`
}

// Obvious-fake EIN.
function fakeEin(): string {
  return `12-345678${faker.number.int({ min: 0, max: 9 })}`
}

function maskSsn(ssn: string): string {
  const last4 = ssn.replace(/\D/g, '').slice(-4)
  return `XXX-XX-${last4}`
}

// printed is the en-US comma-formatted amount; expected strips the commas.
function money(n: number): { printed: string; expected: string } {
  const printed = n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return { printed, expected: printed.replace(/,/g, '') }
}

function gt(
  key: string,
  box: string,
  type: FieldType,
  printed: string,
  expected: string,
  expectEmpty = false,
): FieldGT {
  return { key, box, type, printed, expected, expectEmpty }
}

export function makeScenario(
  scenario: Scenario,
  seed: number,
): { formData: FormData; groundTruth: GroundTruth } {
  faker.seed(seed)

  const employeeName = faker.person.fullName()
  const employerName = faker.company.name()
  const addr = () =>
    `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({
      abbreviated: true,
    })} ${faker.location.zipCode('#####')}`

  const wagesN = scenario === 'large_values' ? 1234567.89 : faker.number.int({ min: 30000, max: 95000 })
  const wages = money(wagesN)
  const ss = money(wagesN)
  const med = money(wagesN)
  const ssTax = money(Math.round(wagesN * 0.062 * 100) / 100)
  const medTax = money(Math.round(wagesN * 0.0145 * 100) / 100)
  const fed = money(
    scenario === 'large_values' ? 246913.58 : Math.round(wagesN * 0.15 * 100) / 100,
  )
  const stateTax = money(Math.round(wagesN * 0.05 * 100) / 100)

  const rawSsn = fakeSsn()
  const ssn = scenario === 'masked_ssn' ? maskSsn(rawSsn) : rawSsn
  const ein = fakeEin()
  const stateCode = faker.location.state({ abbreviated: true })

  const formData: FormData = {
    wages: wages.printed,
    federalWithholding: scenario === 'zero_withholding' ? '' : fed.printed,
    socialSecurityWages: ss.printed,
    employerEIN: ein,
    employeeSSN: ssn,
    employeeName,
    employerName,
    employeeAddress: addr(),
    employerAddress: addr(),
    controlNumber: faker.string.alphanumeric(8).toUpperCase(),
    socialSecurityTaxWithheld: ssTax.printed,
    medicareWages: med.printed,
    medicareTaxWithheld: medTax.printed,
    stateCode,
    stateWages: wages.printed,
    stateTax: stateTax.printed,
  }

  const fields: Record<string, FieldGT> = {
    wages: gt('wages', '1', 'currency', wages.printed, wages.expected),
    federalWithholding:
      scenario === 'zero_withholding'
        ? gt('federalWithholding', '2', 'currency', '', '', true)
        : gt('federalWithholding', '2', 'currency', fed.printed, fed.expected),
    socialSecurityWages: gt('socialSecurityWages', '3', 'currency', ss.printed, ss.expected),
    employerEIN: gt('employerEIN', 'b', 'ein', ein, ein),
    employeeSSN: gt('employeeSSN', 'a', 'ssn', ssn, ssn),
    employeeName: gt('employeeName', 'e', 'text', employeeName, employeeName),
    employerName: gt('employerName', 'c', 'text', employerName, employerName),
  }

  return { formData, groundTruth: { scenario, fields } }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/eval/groundtruth.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 6: Commit**

```bash
git add scripts/eval/types.ts scripts/eval/groundtruth.ts scripts/eval/groundtruth.test.ts
git commit -m "feat: seeded W-2 ground-truth scenarios with obvious-fake identifiers"
```

---

### Task 4: Pure scoring, bbox sanity, and results table

**Files:**
- Create: `scripts/eval/score.ts`
- Test: `scripts/eval/score.test.ts`

**Interfaces:**
- Consumes: `BBox`, `Field` (type-only) from `src/types.ts`; `FieldGT`, `GroundTruth` from `./types`; `normalizeByType` from `./normalize`.
- Produces:
  - `bboxOk(b: BBox): { ok: boolean; problems: string[] }`
  - `scoreField(gt: FieldGT, field: Field | undefined): FieldScore`
  - `scoreVariant(variant: string, gt: GroundTruth, result: { fields: Field[]; status: string; detectedFormType: string; error?: string }): VariantScore`
  - `renderResultsTable(rows: VariantScore[]): string`
  - Types `FieldScore`, `VariantScore`.

- [ ] **Step 1: Write the failing test**

Create `scripts/eval/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { BBox, Field } from '../../src/types'
import type { GroundTruth } from './types'
import { bboxOk, scoreField, scoreVariant, renderResultsTable } from './score'

const okBox: BBox = { page: 1, x: 10, y: 20, w: 15, h: 5 }

function field(over: Partial<Field>): Field {
  return {
    key: 'wages',
    label: 'Wages',
    box: '1',
    value: '84200.00',
    originalValue: '84200.00',
    confidence: 0.95,
    type: 'currency',
    bbox: okBox,
    ...over,
  }
}

describe('bboxOk', () => {
  it('accepts an in-range, on-page box', () => {
    expect(bboxOk(okBox).ok).toBe(true)
  })
  it('flags an out-of-range coordinate (Gemini 0 to 1000 bug signal)', () => {
    const r = bboxOk({ page: 1, x: 500, y: 20, w: 15, h: 5 })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('x=500')
  })
  it('flags an off-page box', () => {
    const r = bboxOk({ page: 1, x: 90, y: 20, w: 30, h: 5 })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('off-page')
  })
  it('flags a wrong page', () => {
    expect(bboxOk({ page: 2, x: 1, y: 1, w: 1, h: 1 }).ok).toBe(false)
  })
})

describe('scoreField', () => {
  const gtWages = { key: 'wages', box: '1', type: 'currency' as const, printed: '84,200.00', expected: '84200.00', expectEmpty: false }

  it('passes on a normalized match', () => {
    expect(scoreField(gtWages, field({ value: '$84,200.00' })).pass).toBe(true)
  })
  it('fails on a mismatch', () => {
    expect(scoreField(gtWages, field({ value: '84200' })).pass).toBe(false)
  })
  it('treats an absent field as empty value', () => {
    expect(scoreField(gtWages, undefined).pass).toBe(false)
  })

  const gtEmpty = { key: 'federalWithholding', box: '2', type: 'currency' as const, printed: '', expected: '', expectEmpty: true }
  it('passes when an empty-expected field is empty', () => {
    expect(scoreField(gtEmpty, field({ key: 'federalWithholding', value: '' })).pass).toBe(true)
  })
  it('fails when an empty-expected field is hallucinated', () => {
    const s = scoreField(gtEmpty, field({ key: 'federalWithholding', value: '1234.00' }))
    expect(s.pass).toBe(false)
    expect(s.note).toContain('HALLUCINATED')
  })
})

describe('scoreVariant + renderResultsTable', () => {
  const gt: GroundTruth = {
    scenario: 'clean',
    fields: {
      wages: { key: 'wages', box: '1', type: 'currency', printed: '84,200.00', expected: '84200.00', expectEmpty: false },
      employeeName: { key: 'employeeName', box: 'e', type: 'text', printed: 'Jane Roe', expected: 'Jane Roe', expectEmpty: false },
    },
  }
  const result = {
    fields: [
      field({ key: 'wages', value: '84200.00', confidence: 0.9, bbox: okBox }),
      field({ key: 'employeeName', type: 'text', value: 'Jane Roe', confidence: 0.8, bbox: { page: 1, x: 200, y: 5, w: 10, h: 4 } }),
    ],
    status: 'ready',
    detectedFormType: 'W-2',
  }

  it('aggregates pass count, mean confidence, and bbox violations', () => {
    const v = scoreVariant('clean', gt, result)
    expect(v.passCount).toBe(2)
    expect(v.passRate).toBe(1)
    expect(v.meanConfidence).toBeCloseTo(0.85, 2)
    expect(v.bboxOk).toBe(false) // employeeName x=200 is out of range
    expect(v.bboxViolations[0]).toContain('employeeName')
  })

  it('renders a markdown table with a header row', () => {
    const v = scoreVariant('clean', gt, result)
    const table = renderResultsTable([v])
    expect(table).toContain('| variant |')
    expect(table).toContain('clean')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/eval/score.test.ts`
Expected: FAIL with "Cannot find module './score'".

- [ ] **Step 3: Write the implementation**

Create `scripts/eval/score.ts`:

```ts
import type { BBox, Field } from '../../src/types'
import type { FieldGT, GroundTruth } from './types'
import { normalizeByType } from './normalize'

export type FieldScore = {
  key: string
  pass: boolean
  expected: string
  got: string
  confidence: number
  bboxOk: boolean
  bboxProblems: string[]
  note: string
}

export type VariantScore = {
  variant: string
  fields: FieldScore[]
  bboxOk: boolean
  bboxViolations: string[]
  meanConfidence: number
  passCount: number
  passRate: number
  status: string
  detectedFormType: string
  error?: string
}

const inRange = (n: number) => n >= 0 && n <= 100

export function bboxOk(b: BBox): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  if (b.page !== 1) problems.push(`page=${b.page} (expected 1)`)
  for (const [k, v] of [
    ['x', b.x],
    ['y', b.y],
    ['w', b.w],
    ['h', b.h],
  ] as const) {
    if (!inRange(v)) problems.push(`${k}=${v} out of 0..100`)
  }
  if (inRange(b.x) && inRange(b.w) && b.x + b.w > 100.01)
    problems.push(`x+w=${(b.x + b.w).toFixed(1)} off-page`)
  if (inRange(b.y) && inRange(b.h) && b.y + b.h > 100.01)
    problems.push(`y+h=${(b.y + b.h).toFixed(1)} off-page`)
  return { ok: problems.length === 0, problems }
}

export function scoreField(g: FieldGT, field: Field | undefined): FieldScore {
  const got = field?.value ?? ''
  const confidence = field?.confidence ?? 0
  // Only validate a bbox when the field is present with a non-empty value. A
  // correctly-empty field reports {0,0,0,0} by design, which is not a violation.
  const bb =
    field && field.value !== '' ? bboxOk(field.bbox) : { ok: true, problems: [] as string[] }

  let pass: boolean
  let note: string
  if (g.expectEmpty) {
    // Anti-hallucination: an empty answer is correct, a plausible value is a fail.
    const empty = normalizeByType(g.type, got) === ''
    pass = empty
    note = empty ? 'empty as required' : `HALLUCINATED "${got}" (should be empty)`
  } else {
    const want = normalizeByType(g.type, g.expected)
    const have = normalizeByType(g.type, got)
    pass = want === have
    note = pass ? 'match' : `want "${want}" got "${have}"`
  }

  return {
    key: g.key,
    pass,
    expected: g.expectEmpty ? '(empty)' : g.expected,
    got,
    confidence,
    bboxOk: bb.ok,
    bboxProblems: bb.problems,
    note,
  }
}

export function scoreVariant(
  variant: string,
  gt: GroundTruth,
  result: { fields: Field[]; status: string; detectedFormType: string; error?: string },
): VariantScore {
  const byKey = new Map(result.fields.map((f) => [f.key, f]))
  const fields = Object.values(gt.fields).map((g) => scoreField(g, byKey.get(g.key)))
  const bboxViolations = fields
    .filter((f) => !f.bboxOk)
    .map((f) => `${variant}/${f.key}: ${f.bboxProblems.join('; ')}`)
  const passCount = fields.filter((f) => f.pass).length
  const conf = fields.map((f) => f.confidence)
  const meanConfidence = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : 0

  return {
    variant,
    fields,
    bboxOk: bboxViolations.length === 0,
    bboxViolations,
    meanConfidence,
    passCount,
    passRate: fields.length ? passCount / fields.length : 0,
    status: result.status,
    detectedFormType: result.detectedFormType,
    error: result.error,
  }
}

export function renderResultsTable(rows: VariantScore[]): string {
  if (rows.length === 0) return '_no variants_\n'
  const keys = rows[0].fields.map((f) => f.key)
  const header = ['variant', ...keys, 'bbox', 'conf', 'pass%', 'status']
  const mark = (b: boolean) => (b ? 'PASS' : 'FAIL')
  const toRow = (cells: string[]) => `| ${cells.join(' | ')} |`
  const lines = rows.map((r) => {
    const byKey = new Map(r.fields.map((f) => [f.key, f]))
    const cells = keys.map((k) => mark(!!byKey.get(k)?.pass))
    return toRow([
      r.variant,
      ...cells,
      mark(r.bboxOk),
      r.meanConfidence.toFixed(2),
      `${Math.round(r.passRate * 100)}%`,
      r.error ? 'error' : r.status,
    ])
  })
  return [toRow(header), toRow(header.map(() => '---')), ...lines].join('\n') + '\n'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/eval/score.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS, including the three new pure test files plus the existing suite.

- [ ] **Step 6: Commit**

```bash
git add scripts/eval/score.ts scripts/eval/score.test.ts
git commit -m "feat: field scoring, bbox sanity, and results table for the eval harness"
```

---

### Task 5: Render scenarios from the IRS fillable W-2

**Files:**
- Create: `scripts/eval/make-w2.ts`

**Interfaces:**
- Consumes: `makeScenario`, `SCORED_KEYS`, `Scenario` from `./groundtruth`; `FormData`, `Layout`, `VariantManifestEntry` from `./types`; `pdf-lib`, `pdf-to-img`.
- Produces: `generateRenderVariants(): Promise<VariantManifestEntry[]>`. Writes to `scripts/eval/out/`: `<scenario>.png`, `<scenario>.groundtruth.json` for each of the 4 scenarios, plus `clean.layout.json` and `clean.formdata.json`.

Note on `FIELD_MAP`: the names below reflect the IRS fillable `fw2.pdf` AcroForm and are validated at runtime. The form repeats fields per copy, so the page-1 copy names are used. If the placed PDF differs, the script stops and prints the actual field names; reconcile `FIELD_MAP` from `DUMP_FIELDS=1` output (see README). This discovery step is intentional because the PDF is an external asset supplied at run time.

- [ ] **Step 1: Write the implementation**

Create `scripts/eval/make-w2.ts`:

```ts
// Fills the IRS fillable W-2, flattens it, renders page 1 to PNG, and writes
// per-scenario ground truth. Run standalone for debugging:
//   DUMP_FIELDS=1 npx vite-node scripts/eval/make-w2.ts   (list AcroForm fields)
//   npx vite-node scripts/eval/make-w2.ts                 (render all scenarios)
// This script does NOT call the model. It only produces images and ground truth.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { PDFDocument, PDFTextField } from 'pdf-lib'
import { pdf } from 'pdf-to-img'
import { makeScenario, SCORED_KEYS, type Scenario } from './groundtruth'
import type { FormData, Layout, VariantManifestEntry } from './types'

const ASSET = new URL('./assets/fw2.pdf', import.meta.url)
const OUT = new URL('./out/', import.meta.url)
const SCALE = 3 // pdf-to-img viewport scale: rendered pixels = PDF points * SCALE

const SEEDS: Record<Scenario, number> = {
  clean: 1,
  zero_withholding: 2,
  masked_ssn: 3,
  large_values: 4,
}

// Logical field key -> AcroForm text-field name on the page-1 copy of fw2.pdf.
// Validated at runtime; reconcile via DUMP_FIELDS=1 if the placed PDF differs.
const FIELD_MAP: Record<keyof FormData, string> = {
  employeeSSN: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_01[0]',
  employerEIN: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_02[0]',
  employerName: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_03[0]',
  employerAddress: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_04[0]',
  controlNumber: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_05[0]',
  employeeName: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_06[0]',
  employeeAddress: 'topmostSubform[0].Copy1[0].LeftCol[0].f2_09[0]',
  wages: 'topmostSubform[0].Copy1[0].RightCol[0].f2_10[0]',
  federalWithholding: 'topmostSubform[0].Copy1[0].RightCol[0].f2_11[0]',
  socialSecurityWages: 'topmostSubform[0].Copy1[0].RightCol[0].f2_12[0]',
  socialSecurityTaxWithheld: 'topmostSubform[0].Copy1[0].RightCol[0].f2_13[0]',
  medicareWages: 'topmostSubform[0].Copy1[0].RightCol[0].f2_14[0]',
  medicareTaxWithheld: 'topmostSubform[0].Copy1[0].RightCol[0].f2_15[0]',
  stateCode: 'topmostSubform[0].Copy1[0].RightCol[0].f2_24[0]',
  stateWages: 'topmostSubform[0].Copy1[0].RightCol[0].f2_26[0]',
  stateTax: 'topmostSubform[0].Copy1[0].RightCol[0].f2_27[0]',
}

async function renderPng(pdfBytes: Uint8Array): Promise<Buffer> {
  const doc = await pdf(Buffer.from(pdfBytes), { scale: SCALE })
  for await (const page of doc) return page as Buffer
  throw new Error('pdf-to-img produced no pages')
}

async function fillScenario(
  scenario: Scenario,
  basePdf: Buffer,
): Promise<VariantManifestEntry> {
  const { formData, groundTruth } = makeScenario(scenario, SEEDS[scenario])
  const doc = await PDFDocument.load(basePdf)
  const form = doc.getForm()
  const present = new Set(form.getFields().map((f) => f.getName()))

  // Validate the map. Any non-blank field whose name is missing stops the run.
  const missing = (Object.keys(FIELD_MAP) as (keyof FormData)[])
    .filter((k) => formData[k] !== '' && !present.has(FIELD_MAP[k]))
    .map((k) => `${k} -> "${FIELD_MAP[k]}"`)
  if (missing.length) {
    console.error('FIELD_MAP names not found in fw2.pdf:\n  ' + missing.join('\n  '))
    console.error('\nAvailable field names:\n  ' + [...present].join('\n  '))
    throw new Error('Reconcile FIELD_MAP against the placed PDF (see README).')
  }

  // Capture pixel rects for the scored fields BEFORE flattening (clean only).
  let layout: Layout = {}
  if (scenario === 'clean') {
    const page = doc.getPage(0)
    const pageH = page.getHeight()
    for (const key of SCORED_KEYS) {
      const field = form.getField(FIELD_MAP[key])
      if (!(field instanceof PDFTextField)) continue
      const widget = field.acroField.getWidgets()[0]
      const r = widget.getRectangle() // PDF points, y measured from the bottom
      layout[key] = {
        x: r.x * SCALE,
        y: (pageH - r.y - r.height) * SCALE,
        w: r.width * SCALE,
        h: r.height * SCALE,
      }
    }
  }

  // Fill non-blank fields.
  for (const key of Object.keys(FIELD_MAP) as (keyof FormData)[]) {
    const value = formData[key]
    if (!value) continue
    form.getTextField(FIELD_MAP[key]).setText(value)
  }

  form.flatten() // bake values into the page content so the raster shows them
  const filled = await doc.save()
  const png = await renderPng(filled)

  await writeFile(new URL(`${scenario}.png`, OUT), png)
  await writeFile(
    new URL(`${scenario}.groundtruth.json`, OUT),
    JSON.stringify(groundTruth, null, 2),
  )
  if (scenario === 'clean') {
    await writeFile(new URL('clean.layout.json', OUT), JSON.stringify(layout, null, 2))
    await writeFile(new URL('clean.formdata.json', OUT), JSON.stringify(formData, null, 2))
  }
  return {
    variant: scenario,
    image: `${scenario}.png`,
    mime: 'image/png',
    groundtruth: `${scenario}.groundtruth.json`,
  }
}

export async function generateRenderVariants(): Promise<VariantManifestEntry[]> {
  let basePdf: Buffer
  try {
    basePdf = await readFile(ASSET)
  } catch {
    throw new Error(
      'scripts/eval/assets/fw2.pdf is missing. Download irs.gov/pub/irs-pdf/fw2.pdf there (see README).',
    )
  }
  await mkdir(OUT, { recursive: true })

  if (process.env.DUMP_FIELDS) {
    const form = (await PDFDocument.load(basePdf)).getForm()
    console.log('AcroForm fields in fw2.pdf:')
    for (const f of form.getFields()) console.log(`  ${f.constructor.name}  ${f.getName()}`)
    return []
  }

  const scenarios: Scenario[] = ['clean', 'zero_withholding', 'masked_ssn', 'large_values']
  const entries: VariantManifestEntry[] = []
  for (const s of scenarios) entries.push(await fillScenario(s, basePdf))
  return entries
}

// Standalone debug entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = await generateRenderVariants()
  for (const e of entries) console.log(`rendered ${e.variant} -> out/${e.image}`)
}
```

- [ ] **Step 2: Verify field discovery works against the placed PDF**

Prerequisite: `scripts/eval/assets/fw2.pdf` is present.

Run: `DUMP_FIELDS=1 npx vite-node scripts/eval/make-w2.ts`
Expected: a list of AcroForm field names prints. If the names differ from `FIELD_MAP`, update `FIELD_MAP` to the page-1 copy names and re-run.

- [ ] **Step 3: Verify the renders look correct**

Run: `npx vite-node scripts/eval/make-w2.ts`
Expected: console reports four scenarios rendered. Open `scripts/eval/out/clean.png` and confirm it is a filled W-2 with the faker values visible. Confirm `out/zero_withholding.png` has a blank box 2, `out/masked_ssn.png` shows `XXX-XX-####`, and `out/large_values.png` shows the seven-figure amount. Confirm `out/clean.layout.json` has pixel rects for all 7 scored keys.

Stop-and-report check: if the script errors with "FIELD_MAP names not found" or "fw2.pdf is missing", resolve that before proceeding. If `fw2.pdf` turns out not to be fillable (zero AcroForm fields), STOP and report; the overlay fallback is out of scope for this plan.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval/make-w2.ts
git commit -m "feat: render filled IRS W-2 scenarios with ground truth and field layout"
```

---

### Task 6: Degrade the clean render into variants

**Files:**
- Create: `scripts/eval/degrade.ts`

**Interfaces:**
- Consumes: clean outputs from Task 5 (`out/clean.png`, `out/clean.groundtruth.json`, `out/clean.layout.json`, `out/clean.formdata.json`); `FormData`, `GroundTruth`, `Layout`, `LayoutRect`, `VariantManifestEntry` from `./types`; `sharp`, `@napi-rs/canvas`.
- Produces: `generateDegradedVariants(): Promise<VariantManifestEntry[]>`. Writes one image plus one ground-truth JSON per variant into `out/`.

Variants produced (12): `low_res`, `jpeg_artifacts`, `skew_3deg`, `skew_7deg`, `blur`, `underexposed`, `overexposed`, `perspective_warp`, `four_up`, `bw_scan`, `substitute_style`, `illegible_field`. The clean render plus the three other render scenarios come from Task 5, for 16 scored variants total.

- [ ] **Step 1: Write the implementation**

Create `scripts/eval/degrade.ts`:

```ts
// Derives image, layout, and content-image variants from the clean render.
// Run standalone (after make-w2.ts) with: npx vite-node scripts/eval/degrade.ts
// This script does NOT call the model.
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import type {
  FormData,
  GroundTruth,
  Layout,
  LayoutRect,
  VariantManifestEntry,
} from './types'

const OUT = new URL('./out/', import.meta.url)

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(new URL(name, OUT), 'utf8')) as T
}

type Point = { x: number; y: number }

// Bilinear interpolation of a quad's four corners [TL, TR, BR, BL] at (u, v).
function bilerp(q: Point[], u: number, v: number): Point {
  const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u }
  const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u }
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v }
}

// Draw the source triangle s onto the destination triangle d via an affine map.
function drawTri(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  img: Awaited<ReturnType<typeof loadImage>>,
  s: Point[],
  d: Point[],
): void {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(d[0].x, d[0].y)
  ctx.lineTo(d[1].x, d[1].y)
  ctx.lineTo(d[2].x, d[2].y)
  ctx.closePath()
  ctx.clip()
  const denom = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y)
  const a = ((d[1].x - d[0].x) * (s[2].y - s[0].y) - (d[2].x - d[0].x) * (s[1].y - s[0].y)) / denom
  const b = ((d[1].y - d[0].y) * (s[2].y - s[0].y) - (d[2].y - d[0].y) * (s[1].y - s[0].y)) / denom
  const c = ((d[2].x - d[0].x) * (s[1].x - s[0].x) - (d[1].x - d[0].x) * (s[2].x - s[0].x)) / denom
  const e = ((d[2].y - d[0].y) * (s[1].x - s[0].x) - (d[1].y - d[0].y) * (s[2].x - s[0].x)) / denom
  const tx = d[0].x - a * s[0].x - c * s[0].y
  const ty = d[0].y - b * s[0].x - e * s[0].y
  ctx.setTransform(a, b, c, e, tx, ty)
  ctx.drawImage(img, 0, 0)
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

async function perspective(base: Buffer, W: number, H: number): Promise<Buffer> {
  const img = await loadImage(base)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  const src: Point[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ]
  // Tilt: top edge pushed inward and down on the left, simulating a phone photo.
  const dst: Point[] = [
    { x: W * 0.1, y: H * 0.05 },
    { x: W * 0.93, y: 0 },
    { x: W, y: H },
    { x: 0, y: H * 0.95 },
  ]
  const N = 24
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u0 = i / N
      const u1 = (i + 1) / N
      const v0 = j / N
      const v1 = (j + 1) / N
      const s00 = bilerp(src, u0, v0)
      const s10 = bilerp(src, u1, v0)
      const s11 = bilerp(src, u1, v1)
      const s01 = bilerp(src, u0, v1)
      const d00 = bilerp(dst, u0, v0)
      const d10 = bilerp(dst, u1, v0)
      const d11 = bilerp(dst, u1, v1)
      const d01 = bilerp(dst, u0, v1)
      drawTri(ctx, img, [s00, s10, s11], [d00, d10, d11])
      drawTri(ctx, img, [s00, s11, s01], [d00, d11, d01])
    }
  }
  return canvas.toBuffer('image/png')
}

async function fourUp(base: Buffer, W: number): Promise<Buffer> {
  const half = await sharp(base).resize({ width: Math.round(W / 2) }).png().toBuffer()
  const m = await sharp(half).metadata()
  const hw = m.width ?? Math.round(W / 2)
  const hh = m.height ?? 0
  return sharp({ create: { width: hw * 2, height: hh * 2, channels: 3, background: '#ffffff' } })
    .composite([
      { input: half, left: 0, top: 0 },
      { input: half, left: hw, top: 0 },
      { input: half, left: 0, top: hh },
      { input: half, left: hw, top: hh },
    ])
    .png()
    .toBuffer()
}

async function redact(base: Buffer, rect: LayoutRect): Promise<Buffer> {
  const img = await loadImage(base)
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(rect.x - 6, rect.y - 6, rect.w + 12, rect.h + 12)
  return canvas.toBuffer('image/png')
}

// Re-render the same data in a plain payroll/ADP-style layout (not the IRS red
// form). Amounts carry a dollar sign here to also exercise the $-stripping rule.
async function adpStyle(fd: FormData): Promise<Buffer> {
  const W = 1700
  const H = 2200
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#111111'
  ctx.font = 'bold 46px sans-serif'
  ctx.fillText('Form W-2 Wage and Tax Statement', 80, 120)
  ctx.font = '28px sans-serif'
  ctx.fillText('2025  Payroll provider copy', 80, 168)

  const cell = (label: string, value: string, x: number, y: number) => {
    ctx.strokeStyle = '#cccccc'
    ctx.strokeRect(x - 16, y - 30, 700, 92)
    ctx.fillStyle = '#666666'
    ctx.font = '22px sans-serif'
    ctx.fillText(label, x, y)
    ctx.fillStyle = '#111111'
    ctx.font = '32px sans-serif'
    ctx.fillText(value, x, y + 42)
  }
  const dollars = (v: string) => (v ? `$${v}` : '')

  cell('c Employer name', fd.employerName, 80, 280)
  cell('b Employer EIN', fd.employerEIN, 840, 280)
  cell('e Employee name', fd.employeeName, 80, 420)
  cell('a Employee SSN', fd.employeeSSN, 840, 420)
  cell('1 Wages, tips, other comp.', dollars(fd.wages), 80, 560)
  cell('2 Federal income tax withheld', dollars(fd.federalWithholding), 840, 560)
  cell('3 Social security wages', dollars(fd.socialSecurityWages), 80, 700)
  cell('Employee address', fd.employeeAddress, 80, 840)
  return canvas.toBuffer('image/png')
}

export async function generateDegradedVariants(): Promise<VariantManifestEntry[]> {
  const base = await readFile(new URL('clean.png', OUT))
  const cleanGt = await readJson<GroundTruth>('clean.groundtruth.json')
  const layout = await readJson<Layout>('clean.layout.json')
  const formData = await readJson<FormData>('clean.formdata.json')
  const meta = await sharp(base).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0

  const entries: VariantManifestEntry[] = []
  const emit = async (
    name: string,
    buf: Buffer,
    mime: 'image/png' | 'image/jpeg',
    gt: GroundTruth = cleanGt,
  ) => {
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png'
    const image = `${name}.${ext}`
    const gtName = `${name}.groundtruth.json`
    await writeFile(new URL(image, OUT), buf)
    await writeFile(new URL(gtName, OUT), JSON.stringify(gt, null, 2))
    entries.push({ variant: name, image, mime, groundtruth: gtName })
  }

  // Image quality, one axis each.
  await emit('low_res', await sharp(base).resize({ width: 720 }).png().toBuffer(), 'image/png')
  await emit('jpeg_artifacts', await sharp(base).jpeg({ quality: 35 }).toBuffer(), 'image/jpeg')
  await emit('skew_3deg', await sharp(base).rotate(3, { background: '#ffffff' }).png().toBuffer(), 'image/png')
  await emit('skew_7deg', await sharp(base).rotate(7, { background: '#ffffff' }).png().toBuffer(), 'image/png')
  await emit('blur', await sharp(base).blur(3).png().toBuffer(), 'image/png')
  await emit('underexposed', await sharp(base).modulate({ brightness: 0.5 }).png().toBuffer(), 'image/png')
  await emit('overexposed', await sharp(base).modulate({ brightness: 1.7 }).png().toBuffer(), 'image/png')
  await emit('perspective_warp', await perspective(base, W, H), 'image/png')

  // Layout and rendering.
  await emit('four_up', await fourUp(base, W), 'image/png')
  await emit('bw_scan', await sharp(base).grayscale().linear(1.25, -30).blur(0.6).png().toBuffer(), 'image/png')
  await emit('substitute_style', await adpStyle(formData), 'image/png')

  // Content edge case handled on the image side: redact one field, expect empty.
  const illegibleGt: GroundTruth = {
    scenario: 'illegible_field',
    fields: {
      ...cleanGt.fields,
      wages: { ...cleanGt.fields.wages, printed: '', expected: '', expectEmpty: true },
    },
  }
  await emit('illegible_field', await redact(base, layout.wages), 'image/png', illegibleGt)

  return entries
}

// Standalone debug entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = await generateDegradedVariants()
  for (const e of entries) console.log(`degraded ${e.variant} -> out/${e.image}`)
}
```

- [ ] **Step 2: Verify the variants look correct**

Prerequisite: Task 5 has produced `out/clean.*`.

Run: `npx vite-node scripts/eval/degrade.ts`
Expected: console reports 12 variants. Spot-check `out/`: `skew_7deg.png` is rotated, `jpeg_artifacts.jpg` is a JPEG, `perspective_warp.png` is trapezoidal, `four_up.png` has a 2 by 2 grid, `bw_scan.png` is grayscale, `substitute_style.png` is a plain non-red table with the same data, `illegible_field.png` has box 1 covered. If `substitute_style.png` text is blank, register a font with `GlobalFonts.registerFromPath(...)` from `@napi-rs/canvas` (system sans-serif missing); note this in the README.

- [ ] **Step 3: Commit**

```bash
git add scripts/eval/degrade.ts
git commit -m "feat: image, layout, and content degradation variants for the eval harness"
```

---

### Task 7: Orchestrate the live run and emit the results table

**Files:**
- Create: `scripts/eval/run.ts`
- Modify: `scripts/eval/results.md` (overwritten by a live run; the committed seed stays in git until a real run is committed)

**Interfaces:**
- Consumes: `extractW2` from `src/extract/w2.ts`; `generateRenderVariants` from `./make-w2`; `generateDegradedVariants` from `./degrade`; `scoreVariant`, `renderResultsTable`, `VariantScore` from `./score`; `GroundTruth`, `VariantManifestEntry` from `./types`.
- Produces: console table plus `scripts/eval/results.md`. Returns nothing; this is the top-level script the user runs.

- [ ] **Step 1: Write the implementation**

Create `scripts/eval/run.ts`:

```ts
// Live eval runner. Generates every variant, runs each through the SAME
// production extractW2, scores field by field, and writes the accuracy table.
//   GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts
//   SKIP_GEN=1 GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts  (reuse out/)
import { readFile, writeFile } from 'node:fs/promises'
import { extractW2 } from '../../src/extract/w2'
import { generateRenderVariants } from './make-w2'
import { generateDegradedVariants } from './degrade'
import { scoreVariant, renderResultsTable, type VariantScore } from './score'
import type { GroundTruth, VariantManifestEntry } from './types'

const OUT = new URL('./out/', import.meta.url)
const RESULTS = new URL('./results.md', import.meta.url)

async function buildManifest(): Promise<VariantManifestEntry[]> {
  if (process.env.SKIP_GEN) {
    return JSON.parse(await readFile(new URL('manifest.json', OUT), 'utf8'))
  }
  const render = await generateRenderVariants()
  const degraded = await generateDegradedVariants()
  const manifest = [...render, ...degraded]
  await writeFile(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2))
  return manifest
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('Set GEMINI_API_KEY to run the live eval.')
    process.exit(1)
  }

  const manifest = await buildManifest()
  const rows: VariantScore[] = []

  for (const m of manifest) {
    const bytes = await readFile(new URL(m.image, OUT))
    const gt = JSON.parse(await readFile(new URL(m.groundtruth, OUT), 'utf8')) as GroundTruth
    const result = await extractW2({ bytes, mimeType: m.mime }, apiKey)
    const score = scoreVariant(m.variant, gt, result)
    rows.push(score)
    const flag = score.bboxOk ? '' : '  [BBOX OUT OF RANGE]'
    console.log(
      `${m.variant.padEnd(18)} pass ${score.passCount}/${score.fields.length}` +
        `  conf ${score.meanConfidence.toFixed(2)}  ${score.error ? 'ERROR ' + score.error : score.status}${flag}`,
    )
  }

  const table = renderResultsTable(rows)
  const violations = rows.flatMap((r) => r.bboxViolations)

  // Loud, do-not-patch report: an out-of-range bbox points at a production bug
  // (for example Gemini returning 0 to 1000 coordinates). The harness flags it and
  // stops short of changing any production code.
  let bboxSection = '\n## bbox sanity\n\nAll bboxes within 0 to 100 and on-page.\n'
  if (violations.length) {
    console.error('\nWARNING: bbox values out of the 0 to 100 range. Possible production bug, not patched here:')
    for (const v of violations) console.error('  ' + v)
    bboxSection =
      '\n## bbox sanity\n\nWARNING: out-of-range bboxes detected (possible production bug, not patched):\n\n' +
      violations.map((v) => `- ${v}`).join('\n') +
      '\n'
  }

  const doc =
    '# W-2 Extraction Eval Results\n\n' +
    'Generated by `scripts/eval/run.ts` against the live Gemini API through the production `extractW2` path.\n\n' +
    'Columns: per-field PASS/FAIL, bbox (all fields in range and on-page), conf (mean confidence), pass% (overall), status.\n\n' +
    table +
    bboxSection

  await writeFile(RESULTS, doc)
  console.log('\n' + table)
  console.log(`Wrote ${manifest.length} variants to scripts/eval/results.md`)
}

// Run only when invoked directly, so the module can be imported for a smoke check.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
```

- [ ] **Step 2: Run the live eval end to end**

Prerequisite: `scripts/eval/assets/fw2.pdf` present, `GEMINI_API_KEY` set.

Run: `GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts`
Expected: 16 variants generate and score; a per-variant line prints for each; `scripts/eval/results.md` is rewritten with the table. Read the table. The `clean` row should be near all PASS with high confidence. The content edge-case rows (`zero_withholding`, `masked_ssn`, `illegible_field`, `large_values`) should reflect the RIGHT behavior per the spec. If any row shows `[BBOX OUT OF RANGE]`, STOP and report it as a likely production bug; do not modify `buildW2Document`.

- [ ] **Step 3: Restore the seed results placeholder before committing scripts**

The live `results.md` contains run-specific data. Decide with the user whether to commit a real run or keep the seed. To keep the repo green without committing run-specific output, restore the seed:

```bash
git checkout scripts/eval/results.md
```

(If the user wants a real run committed instead, skip this and `git add scripts/eval/results.md`.)

- [ ] **Step 4: Confirm the suite is still green and the build passes**

```bash
npm test
npm run build
```

Expected: PASS. Only the three pure test files were added to the suite; nothing imports the live path or native libs at test time.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/run.ts
git commit -m "feat: live W-2 eval runner emitting per-variant accuracy table"
```

---

## Self-Review

**Spec coverage:**
- Ground truth plus clean source: Task 5 fills `fw2.pdf` with faker values, emits page-1 PNG plus ground-truth JSON, `clean` baseline pair produced. Obvious-fake SSNs enforced in Task 3 and tested.
- Image-quality variants (low_res, jpeg_artifacts, skew_3deg, skew_7deg, blur, underexposed, overexposed, perspective_warp): Task 6.
- Layout/rendering variants (four_up, substitute_style, bw_scan): Task 6.
- Content edge cases (zero_withholding, masked_ssn, illegible_field, large_values): zero_withholding/masked_ssn/large_values are render scenarios (Task 3 plus Task 5), illegible_field is an image redaction (Task 6). All carry ground truth that scores the RIGHT behavior (empty plus low-confidence is a pass, hallucination is a fail), tested in Task 4.
- Eval runner: Task 7 runs `extractW2` per variant, scores per field with type normalization, records bbox sanity and mean confidence, flags off-page or out-of-range bboxes, emits a console plus `results.md` table with per-field pass/fail, bbox-ok, mean confidence, and overall pass rate.
- Invariants: bbox normalization untouched (harness reads only); no production code modified; out-of-range bbox triggers a loud report, not a patch; live API kept out of the Vitest suite; pure logic tested in Vitest per the chosen strategy.

**Placeholder scan:** No TBD or "implement later". `FIELD_MAP` carries concrete names plus a runtime validation and discovery path; this is intentional for an external asset and is documented, not a placeholder.

**Type consistency:** `FormData`, `GroundTruth`, `FieldGT`, `Layout`, `VariantManifestEntry` defined in Task 3 `types.ts`, consumed unchanged in Tasks 4 through 7. `makeScenario`/`SCORED_KEYS` signatures match between Task 3 (definition) and Tasks 5 and 6 (use). `scoreVariant`/`renderResultsTable`/`VariantScore` match between Task 4 (definition) and Task 7 (use). The 7 scored keys appear in identical order in `groundtruth.ts`, `SCORED_KEYS`, and the table columns.

**Known risk to verify at execution time:** `fw2.pdf` must be a fillable AcroForm with the page-1 field names. If it is flat, Task 5 stops and reports; the overlay fallback is intentionally out of scope.
