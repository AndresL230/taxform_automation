# Form Registry and 1099-NEC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the W-2-hardcoded extraction pipeline with a form registry, then add 1099-NEC as a second form type, so further forms become a registry entry rather than new plumbing.

**Architecture:** A `FormDefinition` (fieldDefs + Gemini responseSchema + Zod validate + promptFragment) per form, keyed in a registry. A COMMON layer owns the prompt scaffold, the shared per-field schema builder, and the generic join (`buildDocument`). Extraction is two Gemini calls: a cheap classify call routes to a `FormDefinition`, then a per-form extract call. The client mapping and UI drive off a widened `Document.formType: string`.

**Tech Stack:** TypeScript, Cloudflare Workers, `@google/genai`, Zod, React, Vitest, vite-node (eval scripts), pdf-lib + sharp + @napi-rs/canvas (eval rendering).

## Global Constraints

- No em dashes or en dashes in any artifact (code, comments, copy, docs). Use a comma. Hard repo rule.
- No `Co-Authored-By` trailers on commits.
- Status rules are UNCHANGED: `!isLegible` -> `failed`; any empty value or `confidence < 0.7` -> `needs_review`; else `ready`.
- bbox values stay in the 0 to 100 range; bbox normalization stays inside `buildDocument` (identity pass-through today).
- These tests must pass UNCHANGED: `src/extract/w2.test.ts`, `src/worker.test.ts`, `scripts/eval/normalize.test.ts`, `scripts/eval/score.test.ts`, `scripts/eval/groundtruth.test.ts`.
- Model id stays `gemini-3.5-flash`. Gemini calls use `temperature: 0`, `responseMimeType: 'application/json'`.
- Run the suite with `npm test` (vitest run).

---

## Phase A: Extraction core (the registry)

### Task A1: Shared build layer (schemas, ParsedExtraction, buildDocument)

**Files:**
- Create: `src/extract/build.ts`
- Test: `src/extract/build.test.ts` (written in Task A5, after NEC_FORM exists; A1 ships with a self-contained test below)

**Interfaces:**
- Consumes: `BBox`, `DocStatus`, `Field`, `FieldType` from `../types`; `FieldDef` type from `./registry` (type-only).
- Produces:
  - `Extracted` (Zod schema + inferred type `{ value: string; confidence: number; bbox: BBox }`)
  - `type ParsedExtraction = { isLegible: boolean; fields: Record<string, Extracted> }`
  - `buildFormSchemas(fieldKeys: readonly string[]): { responseSchema: Schema; validate: (raw: unknown) => ParsedExtraction }`
  - `buildDocument(parsed: ParsedExtraction, formDef: { fieldDefs: readonly FieldDef[] }): { fields: Field[]; status: DocStatus }`

- [ ] **Step 1: Write `src/extract/build.ts`**

```ts
import { Type } from '@google/genai'
import type { Schema } from '@google/genai'
import { z } from 'zod'
import type { DocStatus, Field } from '../types'
import type { FieldDef } from './registry'

// Shared per-field validated shape, identical across forms.
const BBoxZ = z.object({
  page: z.number().int(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})
export const Extracted = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: BBoxZ,
})
export type Extracted = z.infer<typeof Extracted>

export type ParsedExtraction = { isLegible: boolean; fields: Record<string, Extracted> }

// Google response-schema fragment for one extracted field. No numeric min/max/int
// constraints; Zod enforces those on our side.
const extractedSchema: Schema = {
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

// Build the Gemini response schema and the Zod validator for a form from its field
// keys. The extract response is uniform: { isLegible, fields: { <key>: extracted } }.
export function buildFormSchemas(fieldKeys: readonly string[]): {
  responseSchema: Schema
  validate: (raw: unknown) => ParsedExtraction
} {
  const fieldProps: Record<string, Schema> = {}
  for (const k of fieldKeys) fieldProps[k] = extractedSchema
  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      isLegible: { type: Type.BOOLEAN },
      fields: { type: Type.OBJECT, properties: fieldProps, required: [...fieldKeys] },
    },
    required: ['isLegible', 'fields'],
  }
  const zodFields: Record<string, z.ZodTypeAny> = {}
  for (const k of fieldKeys) zodFields[k] = Extracted
  const validator = z.object({ isLegible: z.boolean(), fields: z.object(zodFields) })
  return { responseSchema, validate: (raw: unknown): ParsedExtraction => validator.parse(raw) }
}

// Backend join. The model never generates the field constants. Identical join and
// status logic for every form, driven by formDef.fieldDefs.
export function buildDocument(
  parsed: ParsedExtraction,
  formDef: { fieldDefs: readonly FieldDef[] },
): { fields: Field[]; status: DocStatus } {
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
      // is an identity pass-through today. Any future conversion (for example 0 to 1000
      // or corner coordinates) goes HERE, shared by all forms, so fixtures stay 0 to 100
      // and production matches.
      bbox: ex.bbox,
    }
  })

  let status: DocStatus
  if (!parsed.isLegible) {
    status = 'failed'
  } else if (fields.some((f) => f.value === '' || f.confidence < 0.7)) {
    status = 'needs_review'
  } else {
    status = 'ready'
  }

  return { fields, status }
}
```

- [ ] **Step 2: Write a self-contained failing test `src/extract/build.test.ts`**

```ts
import { buildDocument, buildFormSchemas, type ParsedExtraction } from './build'
import type { FieldDef, Field } from '../types'

const FIELDS = [
  { key: 'a', box: '1', label: 'Alpha', type: 'currency' },
  { key: 'b', box: '', label: 'Bravo', type: 'text' },
] as const satisfies readonly FieldDef[]

const ex = (value: string, confidence: number) => ({ value, confidence, bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 } })
const ok = (): ParsedExtraction['fields'] => ({ a: ex('100.00', 0.95), b: ex('Bee', 0.9) })

test('buildDocument joins fieldDefs into the frozen Field shape with originalValue === value', () => {
  const { fields, status } = buildDocument({ isLegible: true, fields: ok() }, { fieldDefs: FIELDS })
  expect(status).toBe('ready')
  expect(fields).toHaveLength(2)
  expect(fields[0]).toEqual({
    key: 'a', label: 'Alpha', box: '1', value: '100.00', originalValue: '100.00',
    confidence: 0.95, type: 'currency', bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
  })
  for (const f of fields) expect(Object.keys(f).sort()).toEqual(
    ['bbox', 'box', 'confidence', 'key', 'label', 'originalValue', 'type', 'value'].sort(),
  )
})

test('status tiers: failed when not legible, needs_review on empty or low confidence', () => {
  expect(buildDocument({ isLegible: false, fields: ok() }, { fieldDefs: FIELDS }).status).toBe('failed')
  const lowConf = { ...ok(), a: ex('100.00', 0.5) }
  expect(buildDocument({ isLegible: true, fields: lowConf }, { fieldDefs: FIELDS }).status).toBe('needs_review')
  const empty = { ...ok(), b: ex('', 0.95) }
  expect(buildDocument({ isLegible: true, fields: empty }, { fieldDefs: FIELDS }).status).toBe('needs_review')
})

test('buildFormSchemas validate accepts a well-formed payload and rejects a missing field', () => {
  const { validate } = buildFormSchemas(['a', 'b'])
  expect(validate({ isLegible: true, fields: ok() }).isLegible).toBe(true)
  expect(() => validate({ isLegible: true, fields: { a: ex('1', 0.9) } })).toThrow()
})
```

This test imports `FieldDef` from `../types`, so re-export it there in Step 3.

- [ ] **Step 3: Re-export `FieldDef` from `src/types.ts`**

Add to `src/types.ts` (after `FieldType`):

```ts
export type FieldDef = { key: string; box: string; label: string; type: FieldType }
```

And in `src/extract/build.ts` and `src/extract/registry.ts`, import `FieldDef` from `../types` instead of `./registry` (keeps the canonical definition in `types.ts`, avoids a build<->registry type cycle). Update the Task A1 `build.ts` import line to:

```ts
import type { DocStatus, Field, FieldDef } from '../types'
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `npm test -- src/extract/build.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/extract/build.ts src/extract/build.test.ts src/types.ts
git commit -m "feat: shared extract build layer (schemas, buildDocument)"
```

---

### Task A2: Registry (FormDefinition, lookup, normalization)

**Files:**
- Create: `src/extract/registry.ts`
- Test: `src/extract/registry.test.ts`

**Interfaces:**
- Consumes: `FieldDef` from `../types`; `ParsedExtraction` from `./build` (type-only); `W2_FORM` from `./w2`, `NEC_FORM` from `./nec` (added in Tasks A3, A4; until then the registry imports are commented to keep this task self-contained, see Step 1 note).
- Produces:
  - `type FormDefinition = { formType: string; fieldDefs: readonly FieldDef[]; responseSchema: Schema; validate: (raw: unknown) => ParsedExtraction; promptFragment: string }`
  - `normalizeFormType(raw: string): string`
  - `getFormDefinition(rawType: string): FormDefinition | undefined`
  - `FORM_REGISTRY: Record<string, FormDefinition>`, `supportedFormTypes: string[]`

- [ ] **Step 1: Write `src/extract/registry.ts`**

Note: the `W2_FORM` / `NEC_FORM` imports below depend on Tasks A3/A4. To keep A2 testable now, the registry test (Step 2) only exercises `normalizeFormType` and an empty-lookup path. Write the file with the imports in place; Tasks A3/A4 create those modules. If executing strictly in order, temporarily stub `FORM_REGISTRY = {}` and fill it in Task A4 Step 4.

```ts
import type { Schema } from '@google/genai'
import type { FieldDef } from '../types'
import type { ParsedExtraction } from './build'
import { W2_FORM } from './w2'
import { NEC_FORM } from './nec'

export type FormDefinition = {
  formType: string
  fieldDefs: readonly FieldDef[]
  responseSchema: Schema
  validate: (raw: unknown) => ParsedExtraction
  promptFragment: string
}

// Registry keyed by canonical form type. Adding a form is a new entry here plus its
// src/extract/<form>.ts definition, no changes to build/prompt/extract.
export const FORM_REGISTRY: Record<string, FormDefinition> = {
  [W2_FORM.formType]: W2_FORM,
  [NEC_FORM.formType]: NEC_FORM,
}

export const supportedFormTypes = Object.keys(FORM_REGISTRY)

// Map common model spellings to a canonical registry key. Unknown input returns
// trimmed as-is, so the caller can report "Detected {type}, not a supported form.".
export function normalizeFormType(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/[\s_]+/g, '-')
  if (compact === 'W-2' || compact === 'W2') return 'W-2'
  if (compact === '1099-NEC' || compact === '1099NEC') return '1099-NEC'
  return raw.trim()
}

export function getFormDefinition(rawType: string): FormDefinition | undefined {
  return FORM_REGISTRY[normalizeFormType(rawType)]
}
```

- [ ] **Step 2: Write failing test `src/extract/registry.test.ts`**

```ts
import { getFormDefinition, normalizeFormType, supportedFormTypes } from './registry'

test('normalizeFormType canonicalizes common spellings', () => {
  expect(normalizeFormType('w-2')).toBe('W-2')
  expect(normalizeFormType('W2')).toBe('W-2')
  expect(normalizeFormType('1099-nec')).toBe('1099-NEC')
  expect(normalizeFormType('1099 NEC')).toBe('1099-NEC')
  expect(normalizeFormType('1098')).toBe('1098')
})

test('getFormDefinition returns the W-2 and NEC defs, undefined for unsupported', () => {
  expect(getFormDefinition('w-2')?.formType).toBe('W-2')
  expect(getFormDefinition('1099-NEC')?.formType).toBe('1099-NEC')
  expect(getFormDefinition('1098')).toBeUndefined()
  expect(supportedFormTypes).toEqual(expect.arrayContaining(['W-2', '1099-NEC']))
})
```

- [ ] **Step 3: Run the test**

Run: `npm test -- src/extract/registry.test.ts`
Expected: FAIL until Tasks A3 and A4 supply `W2_FORM` and `NEC_FORM`. After A4, PASS. (If running strictly in order with the `FORM_REGISTRY = {}` stub, the first test passes now and the second is completed in Task A4 Step 4.)

- [ ] **Step 4: Commit**

```bash
git add src/extract/registry.ts src/extract/registry.test.ts
git commit -m "feat: form registry types, lookup, and type normalization"
```

---

### Task A3: W-2 form definition + legacy adapter (keep w2.test unchanged)

**Files:**
- Rewrite: `src/extract/w2.ts` (remove `RESPONSE_SCHEMA`, `PROMPT`, `extractW2`; keep `W2_FIELDS`, `W2Extraction`, `buildW2Document`; add `W2_FORM`)
- Unchanged: `src/extract/w2.test.ts` (must still pass)

**Interfaces:**
- Consumes: `buildDocument`, `buildFormSchemas`, `Extracted` from `./build`; `FormDefinition` from `./registry` (type-only); `Field`, `DocStatus` from `../types`.
- Produces: `W2_FIELDS`, `W2_FORM: FormDefinition`, `type W2Extraction`, `buildW2Document(parsed: W2Extraction)`.

- [ ] **Step 1: Rewrite `src/extract/w2.ts`**

```ts
import { z } from 'zod'
import { buildDocument, buildFormSchemas, Extracted } from './build'
import type { FormDefinition } from './registry'
import type { DocStatus, Field, FieldDef } from '../types'

// Backend join constants. The model never generates these.
export const W2_FIELDS = [
  { key: 'wages', box: '1', label: 'Wages, tips, other comp.', type: 'currency' },
  { key: 'federalWithholding', box: '2', label: 'Federal income tax withheld', type: 'currency' },
  { key: 'socialSecurityWages', box: '3', label: 'Social security wages', type: 'currency' },
  { key: 'employerEIN', box: 'b', label: 'Employer EIN', type: 'ein' },
  { key: 'employeeSSN', box: 'a', label: 'Employee SSN', type: 'ssn' },
  { key: 'employeeName', box: 'e', label: 'Employee name', type: 'text' },
  { key: 'employerName', box: 'c', label: 'Employer name', type: 'text' },
] as const satisfies readonly FieldDef[]

const W2_PROMPT_FRAGMENT = `FIELDS TO EXTRACT (W-2):
- wages: Box 1, "Wages, tips, other compensation". Currency.
- federalWithholding: Box 2, "Federal income tax withheld". Currency.
- socialSecurityWages: Box 3, "Social security wages". Currency.
- employerEIN: Box b, the Employer Identification Number. Format ##-#######.
- employeeSSN: Box a, the employee's Social Security Number. Format ###-##-####.
- employeeName: Box e, the employee's full name as printed.
- employerName: Box c, the employer's name as printed (name only, not address).`

const w2Schemas = buildFormSchemas(W2_FIELDS.map((f) => f.key))

export const W2_FORM: FormDefinition = {
  formType: 'W-2',
  fieldDefs: W2_FIELDS,
  responseSchema: w2Schemas.responseSchema,
  validate: w2Schemas.validate,
  promptFragment: W2_PROMPT_FRAGMENT,
}

// --- Legacy adapter, used by w2.test.ts only. Proves the generic buildDocument
// produces identical W-2 output. Production uses W2_FORM. ---
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

export function buildW2Document(parsed: W2Extraction): { fields: Field[]; status: DocStatus } {
  return buildDocument({ isLegible: parsed.isLegibleW2, fields: parsed.fields }, W2_FORM)
}
```

- [ ] **Step 2: Run the unchanged W-2 test**

Run: `npm test -- src/extract/w2.test.ts`
Expected: 4 passed (frozen Field shape, two needs_review tiers, failed-but-mapped). The test file is not edited.

- [ ] **Step 3: Commit**

```bash
git add src/extract/w2.ts
git commit -m "refactor: W-2 as a FormDefinition over the shared build layer"
```

---

### Task A4: 1099-NEC form definition

**Files:**
- Create: `src/extract/nec.ts`
- Test: covered by `src/extract/registry.test.ts` (A2) and a NEC join test in `src/extract/nec.test.ts`

**Interfaces:**
- Consumes: `buildFormSchemas` from `./build`; `FormDefinition` from `./registry` (type-only); `FieldDef` from `../types`.
- Produces: `NEC_FIELDS`, `NEC_FORM: FormDefinition`.

Box numbers confirmed against IRS Form 1099-NEC (Rev. Jan 2024): Box 1 Nonemployee compensation, Box 4 Federal income tax withheld; payer/recipient TIN and name are labeled regions, not numbered boxes.

- [ ] **Step 1: Write `src/extract/nec.ts`**

```ts
import { buildFormSchemas } from './build'
import type { FormDefinition } from './registry'
import type { FieldDef } from '../types'

export const NEC_FIELDS = [
  { key: 'nonemployeeCompensation', box: '1', label: 'Nonemployee compensation', type: 'currency' },
  { key: 'federalWithholding', box: '4', label: 'Federal income tax withheld', type: 'currency' },
  { key: 'payerTIN', box: '', label: "Payer's TIN", type: 'ein' },
  { key: 'recipientTIN', box: '', label: "Recipient's TIN", type: 'ssn' },
  { key: 'payerName', box: '', label: "Payer's name", type: 'text' },
  { key: 'recipientName', box: '', label: "Recipient's name", type: 'text' },
] as const satisfies readonly FieldDef[]

const NEC_PROMPT_FRAGMENT = `FIELDS TO EXTRACT (1099-NEC):
- nonemployeeCompensation: Box 1, "Nonemployee compensation". Currency.
- federalWithholding: Box 4, "Federal income tax withheld". Currency.
- payerTIN: the PAYER'S TIN. Usually an EIN, format ##-####### as printed.
- recipientTIN: the RECIPIENT'S TIN. Usually an SSN, format ###-##-#### as printed.
  Preserve any masking.
- payerName: the PAYER'S name as printed (name only, not address).
- recipientName: the RECIPIENT'S name as printed (name only, not address).
Form-specific notes: a 1099-NEC reports contractor (nonemployee) income. Box 1 is
nonemployee compensation; do not confuse it with Box 7 state income. Federal income tax
withheld is Box 4 (Box 2 is a checkbox, not a dollar amount).`

const necSchemas = buildFormSchemas(NEC_FIELDS.map((f) => f.key))

export const NEC_FORM: FormDefinition = {
  formType: '1099-NEC',
  fieldDefs: NEC_FIELDS,
  responseSchema: necSchemas.responseSchema,
  validate: necSchemas.validate,
  promptFragment: NEC_PROMPT_FRAGMENT,
}
```

- [ ] **Step 2: Write failing test `src/extract/nec.test.ts`**

```ts
import { buildDocument, type ParsedExtraction } from './build'
import { NEC_FORM } from './nec'
import type { Field } from '../types'

const ex = (value: string, confidence: number) => ({ value, confidence, bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 } })
const necFields = (): ParsedExtraction['fields'] => ({
  nonemployeeCompensation: ex('24500.00', 0.97),
  federalWithholding: ex('0.00', 0.96),
  payerTIN: ex('12-3456789', 0.95),
  recipientTIN: ex('123-45-6789', 0.94),
  payerName: ex('Globex Corporation', 0.93),
  recipientName: ex('Dana Lee', 0.92),
})

test('buildDocument maps NEC_FIELDS into 6 Fields in the frozen shape', () => {
  const { fields, status } = buildDocument({ isLegible: true, fields: necFields() }, NEC_FORM)
  expect(status).toBe('ready')
  expect(fields).toHaveLength(6)
  const comp = fields.find((f) => f.key === 'nonemployeeCompensation') as Field
  expect(comp).toEqual({
    key: 'nonemployeeCompensation', label: 'Nonemployee compensation', box: '1',
    value: '24500.00', originalValue: '24500.00', confidence: 0.97, type: 'currency',
    bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
  })
  expect(fields.map((f) => f.key)).toEqual(NEC_FORM.fieldDefs.map((f) => f.key))
})

test('NEC status tiers', () => {
  const low = { ...necFields(), recipientTIN: ex('123-45-6789', 0.5) }
  expect(buildDocument({ isLegible: true, fields: low }, NEC_FORM).status).toBe('needs_review')
  const empty = { ...necFields(), payerName: ex('', 0.95) }
  expect(buildDocument({ isLegible: true, fields: empty }, NEC_FORM).status).toBe('needs_review')
  expect(buildDocument({ isLegible: false, fields: necFields() }, NEC_FORM).status).toBe('failed')
})
```

- [ ] **Step 3: Run NEC + registry tests**

Run: `npm test -- src/extract/nec.test.ts src/extract/registry.test.ts`
Expected: all pass.

- [ ] **Step 4: If A2 used the `FORM_REGISTRY = {}` stub, restore the real registry now**

Confirm `src/extract/registry.ts` imports `W2_FORM` and `NEC_FORM` and populates `FORM_REGISTRY` (as written in A2 Step 1). Re-run `npm test -- src/extract/registry.test.ts`. Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/extract/nec.ts src/extract/nec.test.ts src/extract/registry.ts
git commit -m "feat: 1099-NEC form definition"
```

---

### Task A5: Prompt scaffold + classify prompt

**Files:**
- Create: `src/extract/prompt.ts`
- Test: `src/extract/prompt.test.ts`

**Interfaces:**
- Consumes: `FormDefinition` from `./registry` (type-only).
- Produces:
  - `CLASSIFY_PROMPT: string`, `CLASSIFY_SCHEMA: Schema`, `parseClassification(raw: unknown): { detectedFormType: string }`
  - `buildExtractPrompt(formDef: FormDefinition): string`

- [ ] **Step 1: Write `src/extract/prompt.ts`**

```ts
import { Type } from '@google/genai'
import type { Schema } from '@google/genai'
import { z } from 'zod'
import type { FormDefinition } from './registry'

// --- Classification (first pass) ---
export const CLASSIFY_PROMPT = `You are a tax-document classifier. Identify which U.S. tax
form this document is. Respond with the form type only, using the official name when you
recognize it (for example "W-2", "1099-NEC", "1099-INT", "1098", "1040"). If you cannot
identify it, respond "unknown". Do not extract field values. Return only the JSON object
defined by the schema.`

export const CLASSIFY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: { detectedFormType: { type: Type.STRING } },
  required: ['detectedFormType'],
}

const Classification = z.object({ detectedFormType: z.string() })
export function parseClassification(raw: unknown): { detectedFormType: string } {
  return Classification.parse(raw)
}

// --- Extraction prompt: COMMON scaffold + per-form FIELDS fragment ---
export function buildExtractPrompt(formDef: FormDefinition): string {
  return `You are a precise data-extraction engine for U.S. tax documents. You are given a
single ${formDef.formType} document. Extract only the fields defined below and return them
in the required JSON structure. You transcribe what is printed. You do not calculate,
infer, correct, or complete values.

CORE RULES (these protect a tax preparer who relies on your output):
1. Never guess. If a field is not clearly present and legible, set its value to an empty
   string "" and its confidence at or below 0.3. A blank is recoverable. A confident wrong
   number is a liability.
2. Transcribe exactly what is printed. Do not round, do not reformat amounts beyond the
   normalization rules below, do not fix apparent typos, do not fill in missing digits.
3. If a value is partially obscured or masked, return only the characters you can actually
   read and lower confidence. Do not reconstruct masked digits (a masked SSN printed as
   XXX-XX-1234 is returned as printed).
4. Set isLegible to false if the document is not a ${formDef.formType}, or is too degraded
   to extract reliably.

${formDef.promptFragment}

VALUE FORMATTING:
- Currency: digits and a single decimal point only. Strip the dollar sign and thousands
  separators. Keep cents exactly as printed (84,200.00 becomes "84200.00"). If no cents are
  printed, do not invent them.
- SSN: ###-##-#### as printed. Preserve any masking.
- EIN: ##-####### as printed.
- Text: verbatim, including capitalization.

CONFIDENCE (0 to 1, your honest certainty the value is read correctly):
- 0.95 to 1.0: crisp, unambiguous printed text.
- 0.7 to 0.95: legible with minor noise, slight skew, or light compression.
- 0.3 to 0.7: degraded, faint, handwritten, or ambiguous.
- 0 to 0.3: barely legible, or the field is absent (value "").
Confidence is per field and independent.

BOUNDING BOXES (bbox): give the location of the VALUE itself (the printed data, not the
label, not the box outline) on the page.
- page: 1-based page number. For a single-page form this is always 1.
- x: left edge of the value as a percentage of page WIDTH (0 to 100).
- y: top edge of the value as a percentage of page HEIGHT (0 to 100).
- w: value width as a percentage of page width.
- h: value height as a percentage of page height.
Box the value tightly. If you cannot locate a field, set bbox to {page:1,x:0,y:0,w:0,h:0}
and value to "".

Return only the JSON object defined by the schema. No prose, no markdown.`
}
```

- [ ] **Step 2: Write failing test `src/extract/prompt.test.ts`**

```ts
import { buildExtractPrompt, parseClassification, CLASSIFY_PROMPT } from './prompt'
import { W2_FORM } from './w2'
import { NEC_FORM } from './nec'

test('classify prompt and parser', () => {
  expect(CLASSIFY_PROMPT).toMatch(/classifier/i)
  expect(parseClassification({ detectedFormType: '1099-NEC' }).detectedFormType).toBe('1099-NEC')
  expect(() => parseClassification({})).toThrow()
})

test('extract prompt names the form and splices its fragment, keeps common rules', () => {
  const w2 = buildExtractPrompt(W2_FORM)
  expect(w2).toContain('single W-2 document')
  expect(w2).toContain('FIELDS TO EXTRACT (W-2)')
  expect(w2).toContain('BOUNDING BOXES')
  const nec = buildExtractPrompt(NEC_FORM)
  expect(nec).toContain('single 1099-NEC document')
  expect(nec).toContain('FIELDS TO EXTRACT (1099-NEC)')
  expect(nec).toContain('Never guess')
})
```

- [ ] **Step 3: Run, expect PASS**

Run: `npm test -- src/extract/prompt.test.ts`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add src/extract/prompt.ts src/extract/prompt.test.ts
git commit -m "feat: common extract prompt scaffold and classifier prompt"
```

---

### Task A6: extractDocument dispatcher (classify -> route -> extract)

**Files:**
- Create: `src/extract/extract.ts`
- Test: `src/extract/extract.test.ts`

**Interfaces:**
- Consumes: `GoogleGenAI`, `Schema` from `@google/genai`; `toBase64` from `../lib/bytes`; `ExtractionResult` from `../types`; `buildDocument` from `./build`; `getFormDefinition`, `FormDefinition` from `./registry`; `CLASSIFY_PROMPT`, `CLASSIFY_SCHEMA`, `parseClassification`, `buildExtractPrompt` from `./prompt`.
- Produces: `extractDocument(file: { bytes: ArrayBuffer | Uint8Array; mimeType: string }, apiKey: string): Promise<ExtractionResult>`.

- [ ] **Step 1: Write `src/extract/extract.ts`**

```ts
import { GoogleGenAI } from '@google/genai'
import type { Schema } from '@google/genai'
import { toBase64 } from '../lib/bytes'
import type { ExtractionResult } from '../types'
import { buildDocument } from './build'
import { getFormDefinition, type FormDefinition } from './registry'
import { CLASSIFY_PROMPT, CLASSIFY_SCHEMA, buildExtractPrompt, parseClassification } from './prompt'

const MODEL = 'gemini-3.5-flash'

type FileInput = { bytes: ArrayBuffer | Uint8Array; mimeType: string }

async function callModel(
  ai: GoogleGenAI,
  prompt: string,
  schema: Schema,
  inline: { data: string; mimeType: string },
): Promise<unknown> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { role: 'user', parts: [{ text: prompt }, { inlineData: { data: inline.data, mimeType: inline.mimeType } }] },
    ],
    config: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  })
  const raw = response.text
  if (!raw) throw new Error('Empty response from model')
  return JSON.parse(raw)
}

export async function extractDocument(file: FileInput, apiKey: string): Promise<ExtractionResult> {
  try {
    const ai = new GoogleGenAI({ apiKey })
    const inline = { data: toBase64(file.bytes), mimeType: file.mimeType }

    // 1. Classify (cheap first pass).
    const { detectedFormType } = parseClassification(await callModel(ai, CLASSIFY_PROMPT, CLASSIFY_SCHEMA, inline))

    // 2. Route to a form definition.
    const formDef: FormDefinition | undefined = getFormDefinition(detectedFormType)
    if (!formDef) {
      return {
        fields: [],
        status: 'failed',
        detectedFormType,
        error: `Detected ${detectedFormType}, not a supported form.`,
      }
    }

    // 3. Extract with the form's own schema and prompt.
    const parsed = formDef.validate(await callModel(ai, buildExtractPrompt(formDef), formDef.responseSchema, inline))

    // 4. Join + status.
    const { fields, status } = buildDocument(parsed, formDef)
    const error = status === 'failed' ? `Detected ${formDef.formType}, could not extract it reliably.` : undefined
    return { fields, status, detectedFormType: formDef.formType, ...(error ? { error } : {}) }
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

- [ ] **Step 2: Write failing test `src/extract/extract.test.ts`**

```ts
// @vitest-environment node
import { expect, test, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: { extractCalls: 0, classifyType: 'W-2', extractPayload: null as unknown },
}))

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: vi.fn(function () {
      return {
        models: {
          generateContent: vi.fn(async (req: any) => {
            const text = req.contents[0].parts[0].text as string
            if (text.includes('tax-document classifier')) {
              return { text: JSON.stringify({ detectedFormType: state.classifyType }) }
            }
            state.extractCalls++
            return { text: JSON.stringify(state.extractPayload) }
          }),
        },
      }
    }),
  }
})

import { extractDocument } from './extract'

const ex = (value: string, confidence = 0.95) => ({ value, confidence, bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 } })
const file = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }

test('W-2 detection routes to the W-2 def and returns 7 fields', async () => {
  state.classifyType = 'W-2'
  state.extractCalls = 0
  state.extractPayload = {
    isLegible: true,
    fields: {
      wages: ex('58500.00'), federalWithholding: ex('7920.00'), socialSecurityWages: ex('60000.00'),
      employerEIN: ex('94-2719303'), employeeSSN: ex('532-19-7766'), employeeName: ex('Jordan A. Reyes'),
      employerName: ex('Northwind Logistics LLC'),
    },
  }
  const result = await extractDocument(file, 'k')
  expect(result.status).toBe('ready')
  expect(result.detectedFormType).toBe('W-2')
  expect(result.fields).toHaveLength(7)
})

test('1099-NEC detection routes to the NEC def and returns 6 fields in order', async () => {
  state.classifyType = '1099-NEC'
  state.extractCalls = 0
  state.extractPayload = {
    isLegible: true,
    fields: {
      nonemployeeCompensation: ex('24500.00'), federalWithholding: ex('0.00'),
      payerTIN: ex('12-3456789'), recipientTIN: ex('123-45-6789'),
      payerName: ex('Globex Corporation'), recipientName: ex('Dana Lee'),
    },
  }
  const result = await extractDocument(file, 'k')
  expect(result.status).toBe('ready')
  expect(result.detectedFormType).toBe('1099-NEC')
  expect(result.fields.map((f) => f.key)).toEqual([
    'nonemployeeCompensation', 'federalWithholding', 'payerTIN', 'recipientTIN', 'payerName', 'recipientName',
  ])
})

test('an unsupported detected type fails without making an extract call', async () => {
  state.classifyType = '1098'
  state.extractCalls = 0
  state.extractPayload = null
  const result = await extractDocument(file, 'k')
  expect(result.status).toBe('failed')
  expect(result.detectedFormType).toBe('1098')
  expect(result.error).toBe('Detected 1098, not a supported form.')
  expect(result.fields).toHaveLength(0)
  expect(state.extractCalls).toBe(0)
})
```

- [ ] **Step 3: Run, expect PASS**

Run: `npm test -- src/extract/extract.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/extract/extract.ts src/extract/extract.test.ts
git commit -m "feat: classify-then-extract dispatcher over the form registry"
```

---

### Task A7: Wire the API to extractDocument

**Files:**
- Modify: `src/api/documents.ts` (swap `extractW2` for `extractDocument`)
- Modify: `src/api/documents.test.ts` (rename the mock payload key `isLegibleW2` -> `isLegible`; keep all assertions)

**Interfaces:**
- Consumes: `extractDocument` from `../extract/extract`.

- [ ] **Step 1: Update the mock payload in `src/api/documents.test.ts`**

Change the hoisted `FAKE` so it satisfies both the classify schema and the W-2 extract schema. Replace `isLegibleW2: true,` with `isLegible: true,` (keep `detectedFormType: 'W-2'` and the seven `fields`). All four test bodies and their assertions stay identical.

```ts
const { FAKE } = vi.hoisted(() => ({
  FAKE: {
    detectedFormType: 'W-2',
    isLegible: true,
    fields: Object.fromEntries(
      ['wages', 'federalWithholding', 'socialSecurityWages', 'employerEIN', 'employeeSSN', 'employeeName', 'employerName'].map(
        (k) => [k, { value: 'x', confidence: 0.95, bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 } }],
      ),
    ),
  },
}))
```

The single `generateContent` mock returns `FAKE` for both the classify call (reads `detectedFormType`) and the extract call (reads `isLegible` + `fields`); Zod ignores the extra keys on each.

- [ ] **Step 2: Update `src/api/documents.ts`**

Change the import and the call:

```ts
import { extractDocument } from '../extract/extract'
```

```ts
  const bytes = await file.arrayBuffer()
  const result = await extractDocument({ bytes, mimeType: file.type }, apiKey)
  return json(result, 200)
```

(Everything else in the file, including the 415 gate, is unchanged.)

- [ ] **Step 3: Run the API + worker tests**

Run: `npm test -- src/api/documents.test.ts src/worker.test.ts`
Expected: all pass (200/ready/7 fields/detectedFormType W-2/no id; 415; 400; 405; routing).

- [ ] **Step 4: Commit**

```bash
git add src/api/documents.ts src/api/documents.test.ts
git commit -m "refactor: route POST /api/documents through extractDocument"
```

---

## Phase B: Client mapping, types, UI

### Task B1: Widen Document.formType and make applyExtraction form-agnostic

**Files:**
- Modify: `src/types.ts` (`formType: 'W-2'` -> `formType: string`)
- Modify: `src/lib/applyExtraction.ts` (pass-through, drive formType from detectedFormType)
- Modify: `src/lib/applyExtraction.test.ts` (rewrite test #4; tests 1 to 3 stay green)

**Interfaces:**
- Produces: `applyExtraction(base, result)` returns `{ ...base, formType: result.detectedFormType, status, fields, error? }`.

- [ ] **Step 1: Widen the type in `src/types.ts`**

Change the `Document` member:

```ts
  formType: string
```

- [ ] **Step 2: Rewrite `src/lib/applyExtraction.ts`**

```ts
import type { Document, ExtractionResult } from '../types'

export type DocumentBase = Pick<Document, 'id' | 'filename' | 'fileUrl' | 'reviewedAt'>

export function applyExtraction(base: DocumentBase, result: ExtractionResult): Document {
  return {
    ...base,
    formType: result.detectedFormType,
    status: result.status,
    fields: result.fields,
    ...(result.error ? { error: result.error } : {}),
  }
}
```

- [ ] **Step 3: Update test #4 in `src/lib/applyExtraction.test.ts`**

Replace the fourth test (the "derives the detectedFormType message" one) with:

```ts
test('failed result carries the server error through and formType reflects detectedFormType', () => {
  const result: ExtractionResult = {
    fields: [], status: 'failed', detectedFormType: '1098',
    error: 'Detected 1098, not a supported form.',
  }
  const doc = applyExtraction(base, result)
  expect(doc.formType).toBe('1098')
  expect(doc.error).toBe('Detected 1098, not a supported form.')
})
```

Tests 1 to 3 are unchanged: test 1 still expects `formType: 'W-2'` (its result has `detectedFormType: 'W-2'`), test 3 still passes the server error through.

- [ ] **Step 4: Run the test**

Run: `npm test -- src/lib/applyExtraction.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/applyExtraction.ts src/lib/applyExtraction.test.ts
git commit -m "refactor: form-agnostic applyExtraction, widen Document.formType"
```

---

### Task B2: Provisional formType in DocumentsContext

**Files:**
- Modify: `src/state/DocumentsContext.tsx` (provisional `formType: ''`)

- [ ] **Step 1: Change the provisional document**

In `addDocuments`, change the provisional object's `formType: 'W-2'` to `formType: ''`:

```tsx
      const provisional: Document = {
        id, filename: file.name, fileUrl, formType: '',
        status: 'processing', reviewedAt: null, fields: [],
      }
```

(The catch-path failed result is unchanged; `detectedFormType: 'unknown'` flows through `applyExtraction`.)

- [ ] **Step 2: Run the context + page tests**

Run: `npm test -- src/state/DocumentsContext.test.tsx src/pages/Home.test.tsx`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/state/DocumentsContext.tsx
git commit -m "refactor: provisional document carries no form type until classified"
```

---

### Task B3: FieldRow hides the box label when empty; UploadZone copy

**Files:**
- Modify: `src/components/FieldRow.tsx` (render "Box {box}" only when `box` is non-empty)
- Modify: `src/components/UploadZone.tsx` (copy mentions both forms)

- [ ] **Step 1: Guard the box sub-label in `src/components/FieldRow.tsx`**

Replace the box line:

```tsx
        <div className="text-[10px] text-muted">Box {field.box}</div>
```

with:

```tsx
        {field.box && <div className="text-[10px] text-muted">Box {field.box}</div>}
```

- [ ] **Step 2: Update copy in `src/components/UploadZone.tsx`**

```tsx
      <div className="mt-2 text-base font-semibold text-ink">Drag &amp; drop your tax forms</div>
      <div className="text-sm text-muted">W-2 and 1099-NEC · PDF, PNG or JPG · or click to browse</div>
```

(Keeps the word "Drag" so `UploadZone.test.tsx`'s `/drag/i` matcher still resolves. The `·` is a middle dot, not a dash.)

- [ ] **Step 3: Run the component tests**

Run: `npm test -- src/components/FieldRow.test.tsx src/components/UploadZone.test.tsx src/components/FormTypeBadge.test.tsx`
Expected: all pass (FieldRow.test asserts a W-2 field with box '1', still shows "Box 1").

- [ ] **Step 4: Commit**

```bash
git add src/components/FieldRow.tsx src/components/UploadZone.tsx
git commit -m "feat: hide empty box label, broaden upload copy to W-2 and 1099-NEC"
```

---

## Phase C: Demo fixtures

### Task C1: Add a 1099-NEC seed fixture, repoint the failed fixture

**Files:**
- Create: `src/fixtures/nec.json`
- Modify: `src/fixtures/scan.json` (unsupported form, with server error)
- Modify: `src/fixtures.ts` (wire the NEC entry)

- [ ] **Step 1: Create `src/fixtures/nec.json`** (post-build ExtractionResult, ready, 6 fields, bboxes in 0 to 100)

```json
{
  "status": "ready",
  "detectedFormType": "1099-NEC",
  "fields": [
    { "key": "nonemployeeCompensation", "label": "Nonemployee compensation", "box": "1", "value": "24500.00", "originalValue": "24500.00", "confidence": 0.98, "type": "currency", "bbox": { "page": 1, "x": 55.0, "y": 30.0, "w": 20.0, "h": 4.0 } },
    { "key": "federalWithholding", "label": "Federal income tax withheld", "box": "4", "value": "0.00", "originalValue": "0.00", "confidence": 0.97, "type": "currency", "bbox": { "page": 1, "x": 55.0, "y": 42.0, "w": 20.0, "h": 4.0 } },
    { "key": "payerTIN", "label": "Payer's TIN", "box": "", "value": "12-3456789", "originalValue": "12-3456789", "confidence": 0.96, "type": "ein", "bbox": { "page": 1, "x": 5.0, "y": 20.0, "w": 25.0, "h": 4.0 } },
    { "key": "recipientTIN", "label": "Recipient's TIN", "box": "", "value": "123-45-6789", "originalValue": "123-45-6789", "confidence": 0.95, "type": "ssn", "bbox": { "page": 1, "x": 35.0, "y": 20.0, "w": 22.0, "h": 4.0 } },
    { "key": "payerName", "label": "Payer's name", "box": "", "value": "Globex Corporation", "originalValue": "Globex Corporation", "confidence": 0.94, "type": "text", "bbox": { "page": 1, "x": 5.0, "y": 8.0, "w": 40.0, "h": 4.0 } },
    { "key": "recipientName", "label": "Recipient's name", "box": "", "value": "Dana Lee", "originalValue": "Dana Lee", "confidence": 0.93, "type": "text", "bbox": { "page": 1, "x": 5.0, "y": 28.0, "w": 30.0, "h": 4.0 } }
  ]
}
```

- [ ] **Step 2: Replace `src/fixtures/scan.json`** with an unsupported-form failure carrying the server error

```json
{
  "status": "failed",
  "detectedFormType": "1098",
  "fields": [],
  "error": "Detected 1098, not a supported form."
}
```

- [ ] **Step 3: Wire the NEC entry in `src/fixtures.ts`**

Add the import and one entry:

```ts
import nec from './fixtures/nec.json'
```

Add to the `entries` array (after the smallco entry):

```ts
  { base: { id: 'doc-nec', filename: 'globex_1099nec.pdf', fileUrl: w2Image, reviewedAt: null }, result: asResult(nec) },
```

- [ ] **Step 4: Commit (test wiring follows in C2)**

```bash
git add src/fixtures/nec.json src/fixtures/scan.json src/fixtures.ts
git commit -m "feat: seed a 1099-NEC fixture and an unsupported-form failure"
```

---

### Task C2: Update fixtures.test for both form types

**Files:**
- Modify: `src/fixtures.test.ts`

- [ ] **Step 1: Update the count, the ready-field-count, and the failed-message tests**

Replace test 1 (the count) to expect 6 and keep the status coverage:

```ts
test('there are 6 documents covering ready, needs_review, and failed', () => {
  expect(fixtures).toHaveLength(6)
  const statuses = fixtures.map((d) => d.status)
  expect(statuses).toContain('ready')
  expect(statuses).toContain('needs_review')
  expect(statuses).toContain('failed')
  expect(statuses).not.toContain('processing')
})
```

Replace test 2 (ready docs have all 7 fields) with a form-aware version:

```ts
test('ready docs have their form field count, confident and non-empty, unedited', () => {
  const counts: Record<string, number> = { 'W-2': 7, '1099-NEC': 6 }
  for (const d of fixtures.filter((d) => d.status === 'ready')) {
    expect(d.fields).toHaveLength(counts[d.formType])
    expect(d.fields.every((f) => f.value !== '' && f.confidence >= 0.7)).toBe(true)
    expect(d.fields.every((f) => f.value === f.originalValue)).toBe(true)
  }
})
```

Replace test 4 (failed message) to match the new unsupported-form fixture:

```ts
test('the failed doc has no fields and the server unsupported-form message', () => {
  const failed = fixtures.find((d) => d.status === 'failed')!
  expect(failed.fields).toHaveLength(0)
  expect(failed.error).toBe('Detected 1098, not a supported form.')
})
```

Tests 3 (needs_review has 7 fields, one below 0.7), 5 (needs_review uses W2_FIELDS keys in order), and 6 (bbox in 0 to 100) are unchanged: the needs_review doc remains a W-2, and the NEC fixture bboxes are within range.

- [ ] **Step 2: Run the fixtures test**

Run: `npm test -- src/fixtures.test.ts`
Expected: 6 passed.

- [ ] **Step 3: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/fixtures.test.ts
git commit -m "test: fixtures cover W-2 and 1099-NEC plus the unsupported-form failure"
```

---

## Phase D: Capture + eval scaffolding (form-parameterized, user runs live)

### Task D1: Point the capture script at extractDocument, add a form label

**Files:**
- Modify: `scripts/capture-fixtures.ts`

- [ ] **Step 1: Update imports, manifest, and call**

Replace the `extractW2` import with `extractDocument`, add a `form` label to each sample (for intent and out-naming), and keep the byte-identical invariant comment accurate:

```ts
import { extractDocument } from '../src/extract/extract'
```

```ts
// `image` is read from src/assets/, `out` is written to src/fixtures/<out>.json.
// `form` records the expected form type (the classifier decides the actual one).
const SAMPLES: { image: string; mime: string; out: string; form: string }[] = [
  { image: 'w2-sample.png', mime: 'image/png', out: 'acme', form: 'W-2' },
  // Add a 1099-NEC sample here once you place one in src/assets/, for example:
  // { image: 'nec-sample.png', mime: 'image/png', out: 'nec', form: '1099-NEC' },
]
```

```ts
  const result = await extractDocument({ bytes, mimeType: s.mime }, apiKey)
```

Update the file's top comment: it now calls the SAME `extractDocument` production path.

- [ ] **Step 2: Type-check (no live key needed)**

Run: `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/capture-fixtures.ts
git commit -m "chore: capture fixtures via extractDocument with a form label"
```

---

### Task D2: NEC ground truth generator

**Files:**
- Create: `scripts/eval/groundtruth-nec.ts`

**Interfaces:**
- Consumes: `faker`, `FieldType` from `../../src/types`, `FieldGT`, `GroundTruth` from `./types`.
- Produces: `type NecScenario`, `NEC_SCORED_KEYS`, `NecFormData`, `makeNecScenario(scenario, seed): { formData: NecFormData; groundTruth: GroundTruth }`.

- [ ] **Step 1: Write `scripts/eval/groundtruth-nec.ts`**

```ts
import { faker } from '@faker-js/faker'
import type { FieldType } from '../../src/types'
import type { FieldGT, GroundTruth } from './types'

export type NecScenario = 'clean' | 'zero_withholding' | 'masked_tin' | 'large_values'

// Scored keys in the same order as NEC_FIELDS in src/extract/nec.ts.
export const NEC_SCORED_KEYS = [
  'nonemployeeCompensation',
  'federalWithholding',
  'payerTIN',
  'recipientTIN',
  'payerName',
  'recipientName',
] as const

export type NecFormData = {
  nonemployeeCompensation: string
  federalWithholding: string
  payerTIN: string
  recipientTIN: string
  payerName: string
  recipientName: string
  // supporting fields for realism, not scored
  payerAddress: string
  recipientAddress: string
  accountNumber: string
  stateCode: string
  stateIncome: string
}

function fakeEin(): string {
  return `12-345678${faker.number.int({ min: 0, max: 9 })}`
}
function fakeSsn(): string {
  const last2 = faker.number.int({ min: 0, max: 99 }).toString().padStart(2, '0')
  return `123-45-67${last2}`
}
function maskTin(ssn: string): string {
  return `XXX-XX-${ssn.replace(/\D/g, '').slice(-4)}`
}
function money(n: number): { printed: string; expected: string } {
  const printed = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return { printed, expected: printed.replace(/,/g, '') }
}
function gt(key: string, box: string, type: FieldType, printed: string, expected: string, expectEmpty = false): FieldGT {
  return { key, box, type, printed, expected, expectEmpty }
}

export function makeNecScenario(
  scenario: NecScenario,
  seed: number,
): { formData: NecFormData; groundTruth: GroundTruth } {
  faker.seed(seed)
  const payerName = faker.company.name()
  const recipientName = faker.person.fullName()
  const addr = () =>
    `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode('#####')}`

  const compN = scenario === 'large_values' ? 1234567.89 : faker.number.int({ min: 8000, max: 95000 })
  const comp = money(compN)
  const fedN = scenario === 'large_values' ? 246913.58 : Math.round(compN * 0.1 * 100) / 100
  const fed = money(fedN)
  const stateInc = money(compN)

  const payerTIN = fakeEin()
  const rawTin = fakeSsn()
  const recipientTIN = scenario === 'masked_tin' ? maskTin(rawTin) : rawTin

  const formData: NecFormData = {
    nonemployeeCompensation: comp.printed,
    federalWithholding: scenario === 'zero_withholding' ? '' : fed.printed,
    payerTIN,
    recipientTIN,
    payerName,
    recipientName,
    payerAddress: addr(),
    recipientAddress: addr(),
    accountNumber: faker.string.alphanumeric(10).toUpperCase(),
    stateCode: faker.location.state({ abbreviated: true }),
    stateIncome: stateInc.printed,
  }

  const fields: Record<string, FieldGT> = {
    nonemployeeCompensation: gt('nonemployeeCompensation', '1', 'currency', comp.printed, comp.expected),
    federalWithholding:
      scenario === 'zero_withholding'
        ? gt('federalWithholding', '4', 'currency', '', '', true)
        : gt('federalWithholding', '4', 'currency', fed.printed, fed.expected),
    payerTIN: gt('payerTIN', '', 'ein', payerTIN, payerTIN),
    recipientTIN: gt('recipientTIN', '', 'ssn', recipientTIN, recipientTIN),
    payerName: gt('payerName', '', 'text', payerName, payerName),
    recipientName: gt('recipientName', '', 'text', recipientName, recipientName),
  }

  return { formData, groundTruth: { scenario, fields } }
}
```

- [ ] **Step 2: Write a quick failing test `scripts/eval/groundtruth-nec.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { makeNecScenario, NEC_SCORED_KEYS } from './groundtruth-nec'

describe('makeNecScenario', () => {
  it('produces all 6 scored fields in field order', () => {
    const { groundTruth } = makeNecScenario('clean', 1)
    expect(Object.keys(groundTruth.fields)).toEqual([...NEC_SCORED_KEYS])
  })
  it('only emits obviously-fake recipient TINs', () => {
    for (let s = 0; s < 20; s++) {
      const { groundTruth } = makeNecScenario('clean', s)
      expect(groundTruth.fields.recipientTIN.printed).toMatch(/^123-45-67\d{2}$/)
    }
  })
  it('zero_withholding leaves box 4 blank and expects empty', () => {
    const { formData, groundTruth } = makeNecScenario('zero_withholding', 2)
    expect(formData.federalWithholding).toBe('')
    expect(groundTruth.fields.federalWithholding.expectEmpty).toBe(true)
  })
  it('masked_tin preserves the mask, not empty', () => {
    const { groundTruth } = makeNecScenario('masked_tin', 3)
    expect(groundTruth.fields.recipientTIN.printed).toMatch(/^XXX-XX-\d{4}$/)
    expect(groundTruth.fields.recipientTIN.expectEmpty).toBe(false)
  })
})
```

- [ ] **Step 3: Run**

Run: `npm test -- scripts/eval/groundtruth-nec.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval/groundtruth-nec.ts scripts/eval/groundtruth-nec.test.ts
git commit -m "feat: 1099-NEC eval ground-truth generator"
```

---

### Task D3: EvalForm config (W-2 and NEC), AcroForm field maps

**Files:**
- Create: `scripts/eval/forms.ts`

**Interfaces:**
- Consumes: `makeScenario`, `SCORED_KEYS`, `Scenario` from `./groundtruth`; `makeNecScenario`, `NEC_SCORED_KEYS`, `NecScenario` from `./groundtruth-nec`; `FormData`, `GroundTruth` from `./types`.
- Produces: `type EvalForm`, `EVAL_FORMS: Record<string, EvalForm>`, `getEvalForm(formType: string): EvalForm`.

- [ ] **Step 1: Write `scripts/eval/forms.ts`**

The W-2 field map is moved here verbatim from `make-w2.ts` (`FIELD_MAP`). The NEC field map is a best-guess against `f1099nec.pdf`, reconciled by the user via `DUMP_FIELDS` (see README, Task D5).

```ts
import type { GroundTruth } from './types'
import { makeScenario, SCORED_KEYS, type Scenario } from './groundtruth'
import { makeNecScenario, NEC_SCORED_KEYS, type NecScenario } from './groundtruth-nec'

export type EvalForm = {
  formType: string
  asset: string // PDF filename under scripts/eval/assets/
  scenarios: string[]
  scoredKeys: readonly string[]
  seeds: Record<string, number>
  // logical field key -> AcroForm text-field name on the page-1 copy
  fieldMap: Record<string, string>
  make: (scenario: string, seed: number) => { formData: Record<string, string>; groundTruth: GroundTruth }
}

const W2: EvalForm = {
  formType: 'W-2',
  asset: 'fw2.pdf',
  scenarios: ['clean', 'zero_withholding', 'masked_ssn', 'large_values'],
  scoredKeys: SCORED_KEYS,
  seeds: { clean: 1, zero_withholding: 2, masked_ssn: 3, large_values: 4 },
  fieldMap: {
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
  },
  make: (scenario, seed) => makeScenario(scenario as Scenario, seed) as { formData: Record<string, string>; groundTruth: GroundTruth },
}

// NEC AcroForm names are a best guess. Reconcile against the real f1099nec.pdf with
// DUMP_FIELDS=1 FORM=1099-NEC npx vite-node scripts/eval/make-form.ts (see README).
const NEC: EvalForm = {
  formType: '1099-NEC',
  asset: 'f1099nec.pdf',
  scenarios: ['clean', 'zero_withholding', 'masked_tin', 'large_values'],
  scoredKeys: NEC_SCORED_KEYS,
  seeds: { clean: 11, zero_withholding: 12, masked_tin: 13, large_values: 14 },
  fieldMap: {
    payerName: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_01[0]',
    payerTIN: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_02[0]',
    recipientTIN: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_03[0]',
    recipientName: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_04[0]',
    recipientAddress: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_05[0]',
    accountNumber: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_07[0]',
    nonemployeeCompensation: 'topmostSubform[0].CopyB[0].RightCol[0].f1_09[0]',
    federalWithholding: 'topmostSubform[0].CopyB[0].RightCol[0].f1_10[0]',
    stateCode: 'topmostSubform[0].CopyB[0].RightCol[0].f1_13[0]',
    stateIncome: 'topmostSubform[0].CopyB[0].RightCol[0].f1_15[0]',
  },
  make: (scenario, seed) => makeNecScenario(scenario as NecScenario, seed) as { formData: Record<string, string>; groundTruth: GroundTruth },
}

export const EVAL_FORMS: Record<string, EvalForm> = { 'W-2': W2, '1099-NEC': NEC }

export function getEvalForm(formType: string): EvalForm {
  const form = EVAL_FORMS[formType]
  if (!form) throw new Error(`Unknown eval form "${formType}". Known: ${Object.keys(EVAL_FORMS).join(', ')}`)
  return form
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no type errors. (No new unit test; this is config exercised by the live make/run steps.)

- [ ] **Step 3: Commit**

```bash
git add scripts/eval/forms.ts
git commit -m "feat: per-form eval config (W-2 and 1099-NEC field maps, scenarios)"
```

---

### Task D4: Generalize make + degrade + run to a form parameter

**Files:**
- Create: `scripts/eval/make-form.ts` (generalized from `make-w2.ts`)
- Modify: `scripts/eval/degrade.ts` (take an `EvalForm` for the form-specific substitute style + redaction key)
- Modify: `scripts/eval/run.ts` (select form via `FORM`, run `extractDocument`)
- Modify: `package.json` (`eval:make`, `eval:run` accept the FORM env; keep defaults)
- Delete: `scripts/eval/make-w2.ts` (superseded by make-form.ts)

**Interfaces:**
- `make-form.ts` produces `generateRenderVariants(form: EvalForm): Promise<VariantManifestEntry[]>`.
- `degrade.ts` produces `generateDegradedVariants(form: EvalForm): Promise<VariantManifestEntry[]>`.

- [ ] **Step 1: Create `scripts/eval/make-form.ts`**

Generalize `make-w2.ts`: take an `EvalForm`, load `form.asset`, validate `form.fieldMap`, capture the clean layout for `form.scoredKeys`, fill, flatten, render, and write `<scenario>.png` + `<scenario>.groundtruth.json` (plus `clean.layout.json` / `clean.formdata.json`). The logic is identical to `make-w2.ts` with `FIELD_MAP` -> `form.fieldMap`, `SCORED_KEYS` -> `form.scoredKeys`, `SEEDS` -> `form.seeds`, `makeScenario` -> `form.make`, `ASSET` -> `form.asset`, and the scenario list -> `form.scenarios`. Keep `SCALE = 3`, `renderPng`, the `DUMP_FIELDS` branch, and the standalone entry point. The standalone entry reads `process.env.FORM` (default `'W-2'`) via `getEvalForm`.

Key shape (full body mirrors make-w2.ts):

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { PDFDocument, PDFTextField } from 'pdf-lib'
import { pdf } from 'pdf-to-img'
import { getEvalForm, type EvalForm } from './forms'
import type { Layout, VariantManifestEntry } from './types'

const OUT = new URL('./out/', import.meta.url)
const SCALE = 3

async function renderPng(pdfBytes: Uint8Array): Promise<Buffer> {
  const doc = await pdf(Buffer.from(pdfBytes), { scale: SCALE })
  for await (const page of doc) return page as Buffer
  throw new Error('pdf-to-img produced no pages')
}

async function fillScenario(form: EvalForm, scenario: string, basePdf: Buffer): Promise<VariantManifestEntry> {
  const { formData, groundTruth } = form.make(scenario, form.seeds[scenario])
  const doc = await PDFDocument.load(basePdf)
  const pdfForm = doc.getForm()
  const present = new Set(pdfForm.getFields().map((f) => f.getName()))

  const missing = Object.keys(form.fieldMap)
    .filter((k) => formData[k] !== undefined && formData[k] !== '' && !present.has(form.fieldMap[k]))
    .map((k) => `${k} -> "${form.fieldMap[k]}"`)
  if (missing.length) {
    console.error(`FIELD_MAP names not found in ${form.asset}:\n  ` + missing.join('\n  '))
    console.error('\nAvailable field names:\n  ' + [...present].join('\n  '))
    throw new Error('Reconcile fieldMap against the placed PDF (see README).')
  }

  let layout: Layout = {}
  if (scenario === 'clean') {
    const page = doc.getPage(0)
    const pageH = page.getHeight()
    for (const key of form.scoredKeys) {
      const name = form.fieldMap[key]
      if (!name) continue // unboxed identity fields may not be redaction targets
      const field = pdfForm.getField(name)
      if (!(field instanceof PDFTextField)) continue
      const r = field.acroField.getWidgets()[0].getRectangle()
      layout[key] = { x: r.x * SCALE, y: (pageH - r.y - r.height) * SCALE, w: r.width * SCALE, h: r.height * SCALE }
    }
  }

  for (const key of Object.keys(form.fieldMap)) {
    const value = formData[key]
    if (!value) continue
    pdfForm.getTextField(form.fieldMap[key]).setText(value)
  }

  pdfForm.flatten()
  const filled = await doc.save()
  const png = await renderPng(filled)
  await writeFile(new URL(`${scenario}.png`, OUT), png)
  await writeFile(new URL(`${scenario}.groundtruth.json`, OUT), JSON.stringify(groundTruth, null, 2))
  if (scenario === 'clean') {
    await writeFile(new URL('clean.layout.json', OUT), JSON.stringify(layout, null, 2))
    await writeFile(new URL('clean.formdata.json', OUT), JSON.stringify(formData, null, 2))
  }
  return { variant: scenario, image: `${scenario}.png`, mime: 'image/png', groundtruth: `${scenario}.groundtruth.json` }
}

export async function generateRenderVariants(form: EvalForm): Promise<VariantManifestEntry[]> {
  let basePdf: Buffer
  try {
    basePdf = await readFile(new URL(`./assets/${form.asset}`, import.meta.url))
  } catch {
    throw new Error(`scripts/eval/assets/${form.asset} is missing (see README).`)
  }
  await mkdir(OUT, { recursive: true })
  if (process.env.DUMP_FIELDS) {
    const pdfForm = (await PDFDocument.load(basePdf)).getForm()
    console.log(`AcroForm fields in ${form.asset}:`)
    for (const f of pdfForm.getFields()) console.log(`  ${f.constructor.name}  ${f.getName()}`)
    return []
  }
  const entries: VariantManifestEntry[] = []
  for (const s of form.scenarios) entries.push(await fillScenario(form, s, basePdf))
  return entries
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const form = getEvalForm(process.env.FORM ?? 'W-2')
  const entries = await generateRenderVariants(form)
  for (const e of entries) console.log(`rendered ${e.variant} -> out/${e.image}`)
}
```

- [ ] **Step 2: Generalize `degrade.ts`**

Change `generateDegradedVariants()` to `generateDegradedVariants(form: EvalForm)`. Move the W-2-specific `adpStyle` into a per-form substitute renderer chosen by `form.formType`: keep the existing W-2 `adpStyle` (rename to `w2SubstituteStyle`), and add a `necSubstituteStyle(fd)` that draws the six NEC fields in a plain payroll-style layout (mirror `w2SubstituteStyle`, labels: "PAYER name", "PAYER TIN", "RECIPIENT name", "RECIPIENT TIN", "1 Nonemployee compensation", "4 Federal income tax withheld"; amounts carry a `$` to exercise stripping). Pick the redaction target from `form.scoredKeys[0]` (W-2 `wages`, NEC `nonemployeeCompensation`) so `illegible_field` redacts a real boxed value; guard with `if (layout[redactKey])`. All image-only axes (`low_res`, `jpeg_artifacts`, `skew_*`, `blur`, `*exposed`, `perspective_warp`, `four_up`, `bw_scan`) are unchanged. The standalone entry reads `process.env.FORM`.

Concretely, change these points in `degrade.ts`:

```ts
import { getEvalForm, type EvalForm } from './forms'
```

```ts
export async function generateDegradedVariants(form: EvalForm): Promise<VariantManifestEntry[]> {
  // ... unchanged reads of clean.png / clean.groundtruth.json / clean.layout.json / clean.formdata.json ...
  // substitute style:
  const substitute = form.formType === '1099-NEC' ? await necSubstituteStyle(formData) : await w2SubstituteStyle(formData)
  await emit('substitute_style', substitute, 'image/png')

  // redaction target = first scored key:
  const redactKey = form.scoredKeys[0]
  if (layout[redactKey]) {
    const illegibleGt: GroundTruth = {
      scenario: 'illegible_field',
      fields: { ...cleanGt.fields, [redactKey]: { ...cleanGt.fields[redactKey], printed: '', expected: '', expectEmpty: true } },
    }
    await emit('illegible_field', await redact(base, layout[redactKey]), 'image/png', illegibleGt)
  }
  return entries
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const form = getEvalForm(process.env.FORM ?? 'W-2')
  const entries = await generateDegradedVariants(form)
  for (const e of entries) console.log(`degraded ${e.variant} -> out/${e.image}`)
}
```

Add `necSubstituteStyle` next to the renamed `w2SubstituteStyle` (same canvas scaffolding, NEC labels and the six NEC values).

- [ ] **Step 3: Update `run.ts` to select the form and call extractDocument**

```ts
import { extractDocument } from '../../src/extract/extract'
import { generateRenderVariants } from './make-form'
import { generateDegradedVariants } from './degrade'
import { getEvalForm } from './forms'
```

In `buildManifest`, pass the form to both generators. In `main`, read `const form = getEvalForm(process.env.FORM ?? 'W-2')`, run `await extractDocument({ bytes, mimeType: m.mime }, apiKey)` per variant, and title the results doc with `form.formType` instead of the hardcoded "W-2". The scoring (`scoreVariant`, `renderResultsTable`) is unchanged (form-agnostic).

- [ ] **Step 4: Update `package.json` scripts**

```json
    "eval:make": "vite-node scripts/eval/make-form.ts",
    "eval:degrade": "vite-node scripts/eval/degrade.ts",
    "eval:run": "vite-node scripts/eval/run.ts",
```

(The `FORM=1099-NEC` env var selects the form; default stays W-2, so existing usage is unchanged.)

- [ ] **Step 5: Delete the superseded `scripts/eval/make-w2.ts`**

```bash
git rm scripts/eval/make-w2.ts
```

- [ ] **Step 6: Type-check and run the eval unit tests (no API, no PDF)**

Run: `npx tsc -b && npm test -- scripts/eval`
Expected: no type errors; `normalize.test.ts`, `score.test.ts`, `groundtruth.test.ts`, `groundtruth-nec.test.ts` all pass. (The live make/run is the user's step with a key and assets.)

- [ ] **Step 7: Commit**

```bash
git add scripts/eval/make-form.ts scripts/eval/degrade.ts scripts/eval/run.ts package.json
git commit -m "refactor: form-parameterized eval harness via extractDocument"
```

---

### Task D5: Update the eval README

**Files:**
- Modify: `scripts/eval/README.md`

- [ ] **Step 1: Document the FORM switch, the NEC asset, and the extractDocument path**

Update the README to: (1) state the harness runs through the production `extractDocument` (classify then extract); (2) add the `FORM=1099-NEC` switch to make/run; (3) add a one-time-setup line for the 1099-NEC asset (`https://www.irs.gov/pub/irs-pdf/f1099nec.pdf` saved as `scripts/eval/assets/f1099nec.pdf`) and reconciling its field names with `DUMP_FIELDS=1 FORM=1099-NEC npx vite-node scripts/eval/make-form.ts`; (4) keep the invariants section, noting bbox normalization stays in `buildDocument`.

Example run lines:

```
GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts                 # W-2 (default)
FORM=1099-NEC GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts   # 1099-NEC
```

- [ ] **Step 2: Confirm no em dashes**

Run: `grep -nP "\x{2014}|\x{2013}" scripts/eval/README.md || echo clean`
Expected: `clean`.

- [ ] **Step 3: Commit**

```bash
git add scripts/eval/README.md
git commit -m "docs: eval README covers the FORM switch and 1099-NEC asset"
```

---

## Final verification

- [ ] **Run the whole suite**

Run: `npm test`
Expected: all green, including the UNCHANGED `w2.test.ts`, `worker.test.ts`, and the eval unit tests.

- [ ] **Type-check and build**

Run: `npx tsc -b && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Dash sweep across changed source**

Run: `grep -rnP "\x{2014}|\x{2013}" src scripts docs/superpowers || echo clean`
Expected: `clean`.

---

## Spec coverage check

- Form registry (FormDefinition, registry, buildDocument, COMMON prompt scaffold, schema builder): Tasks A1, A2, A3, A5.
- Classification, approach (a), unsupported-form error, prefer-detected: Task A6.
- 1099-NEC definition (confirmed boxes, promptFragment, reused FieldType): Task A4.
- Frozen-type change flagged and applied (`formType: string`): Task B1.
- Form-agnostic client mapping, provisional type, UI copy, box label: Tasks B1, B2, B3.
- W-2 regression unchanged, NEC join, classification routing, 415 + stateless kept: Tasks A3 (w2.test), A4 (nec.test), A6 (extract.test), A7 (documents.test mock-only update).
- Seed NEC fixtures + unsupported-form failure: Tasks C1, C2.
- Capture script + eval harness form-parameterized (scaffold): Tasks D1 to D5.
- Out of scope recorded in the spec (1099-INT/DIV next, 1099-B/K-1 deferred, viewer PDF, auth): no tasks, by design.
