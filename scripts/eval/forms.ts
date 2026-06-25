import type { GroundTruth } from './types'
import { makeScenario, SCORED_KEYS, type Scenario } from './groundtruth'
import { makeNecScenario, NEC_SCORED_KEYS, type NecScenario } from './groundtruth-nec'
import { makeIntScenario, INT_SCORED_KEYS, type IntScenario } from './groundtruth-int'

// Eval-side config for one form. Distinct from the production FormDefinition: this also
// carries the PDF asset, the AcroForm field map, and the faker scenario generator that
// the harness needs to render and score a form.
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
  make: (scenario, seed) => {
    const r = makeScenario(scenario as Scenario, seed)
    return { formData: r.formData as Record<string, string>, groundTruth: r.groundTruth }
  },
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
  make: (scenario, seed) => {
    const r = makeNecScenario(scenario as NecScenario, seed)
    return { formData: r.formData as Record<string, string>, groundTruth: r.groundTruth }
  },
}

// INT AcroForm names are a best guess. Reconcile against the real f1099int.pdf with
// DUMP_FIELDS=1 FORM=1099-INT npx vite-node scripts/eval/make-form.ts (see README).
const INT: EvalForm = {
  formType: '1099-INT',
  asset: 'f1099int.pdf',
  scenarios: ['clean', 'zero_withholding', 'masked_tin', 'large_values'],
  scoredKeys: INT_SCORED_KEYS,
  seeds: { clean: 21, zero_withholding: 22, masked_tin: 23, large_values: 24 },
  fieldMap: {
    payerName: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_01[0]',
    payerTIN: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_02[0]',
    recipientTIN: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_03[0]',
    recipientName: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_04[0]',
    recipientAddress: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_05[0]',
    accountNumber: 'topmostSubform[0].CopyB[0].LeftCol[0].f1_07[0]',
    interestIncome: 'topmostSubform[0].CopyB[0].RightCol[0].f1_09[0]',
    earlyWithdrawalPenalty: 'topmostSubform[0].CopyB[0].RightCol[0].f1_10[0]',
    interestUSSavingsBonds: 'topmostSubform[0].CopyB[0].RightCol[0].f1_11[0]',
    federalWithholding: 'topmostSubform[0].CopyB[0].RightCol[0].f1_12[0]',
  },
  make: (scenario, seed) => {
    const r = makeIntScenario(scenario as IntScenario, seed)
    return { formData: r.formData as Record<string, string>, groundTruth: r.groundTruth }
  },
}

export const EVAL_FORMS: Record<string, EvalForm> = { 'W-2': W2, '1099-NEC': NEC, '1099-INT': INT }

export function getEvalForm(formType: string): EvalForm {
  const form = EVAL_FORMS[formType]
  if (!form) throw new Error(`Unknown eval form "${formType}". Known: ${Object.keys(EVAL_FORMS).join(', ')}`)
  return form
}
