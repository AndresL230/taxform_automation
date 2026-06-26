import { buildFormSchemas } from './build'
import { formatChecks } from './checks'
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
  crossChecks: formatChecks,
}
