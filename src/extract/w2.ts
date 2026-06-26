import { z } from 'zod'
import { buildDocument, buildFormSchemas, Extracted } from './build'
import { formatChecks, parseAmount } from './checks'
import type { FormDefinition } from './registry'
import type { DocStatus, Field, FieldDef, ValidationMessage } from '../types'

// Backend join constants. The model never generates these.
export const W2_FIELDS = [
  { key: 'wages', box: '1', label: 'Wages, tips, other comp.', type: 'currency' },
  { key: 'federalWithholding', box: '2', label: 'Federal income tax withheld', type: 'currency' },
  { key: 'socialSecurityWages', box: '3', label: 'Social security wages', type: 'currency' },
  { key: 'socialSecurityTaxWithheld', box: '4', label: 'Social security tax withheld', type: 'currency' },
  { key: 'medicareWages', box: '5', label: 'Medicare wages and tips', type: 'currency' },
  { key: 'medicareTaxWithheld', box: '6', label: 'Medicare tax withheld', type: 'currency' },
  { key: 'employerEIN', box: 'b', label: 'Employer EIN', type: 'ein' },
  { key: 'employeeSSN', box: 'a', label: 'Employee SSN', type: 'ssn' },
  { key: 'employeeName', box: 'e', label: 'Employee name', type: 'text' },
  { key: 'employerName', box: 'c', label: 'Employer name', type: 'text' },
] as const satisfies readonly FieldDef[]

const W2_PROMPT_FRAGMENT = `FIELDS TO EXTRACT (W-2):
- wages: Box 1, "Wages, tips, other compensation". Currency.
- federalWithholding: Box 2, "Federal income tax withheld". Currency.
- socialSecurityWages: Box 3, "Social security wages". Currency.
- socialSecurityTaxWithheld: Box 4, "Social security tax withheld". Currency.
- medicareWages: Box 5, "Medicare wages and tips". Currency.
- medicareTaxWithheld: Box 6, "Medicare tax withheld". Currency.
- employerEIN: Box b, the Employer Identification Number. Format ##-#######.
- employeeSSN: Box a, the employee's Social Security Number. Format ###-##-####.
- employeeName: Box e, the employee's full name as printed.
- employerName: Box c, the employer's name as printed (name only, not address).`

const w2Schemas = buildFormSchemas(W2_FIELDS.map((f) => f.key))

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

export const W2_FORM: FormDefinition = {
  formType: 'W-2',
  fieldDefs: W2_FIELDS,
  responseSchema: w2Schemas.responseSchema,
  validate: w2Schemas.validate,
  promptFragment: W2_PROMPT_FRAGMENT,
  crossChecks: w2CrossChecks,
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
    socialSecurityTaxWithheld: Extracted,
    medicareWages: Extracted,
    medicareTaxWithheld: Extracted,
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
