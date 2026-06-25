import { buildFormSchemas } from './build'
import type { FormDefinition } from './registry'
import type { FieldDef } from '../types'

export const INT_FIELDS = [
  { key: 'interestIncome', box: '1', label: 'Interest income', type: 'currency' },
  { key: 'earlyWithdrawalPenalty', box: '2', label: 'Early withdrawal penalty', type: 'currency' },
  { key: 'interestUSSavingsBonds', box: '3', label: 'Interest on U.S. Savings Bonds and Treasury obligations', type: 'currency' },
  { key: 'federalWithholding', box: '4', label: 'Federal income tax withheld', type: 'currency' },
  { key: 'payerTIN', box: '', label: "Payer's TIN", type: 'ein' },
  { key: 'recipientTIN', box: '', label: "Recipient's TIN", type: 'ssn' },
  { key: 'payerName', box: '', label: "Payer's name", type: 'text' },
  { key: 'recipientName', box: '', label: "Recipient's name", type: 'text' },
] as const satisfies readonly FieldDef[]

const INT_PROMPT_FRAGMENT = `FIELDS TO EXTRACT (1099-INT):
- interestIncome: Box 1, "Interest income". Currency.
- earlyWithdrawalPenalty: Box 2, "Early withdrawal penalty". Currency.
- interestUSSavingsBonds: Box 3, "Interest on U.S. Savings Bonds and Treasury obligations". Currency.
- federalWithholding: Box 4, "Federal income tax withheld". Currency.
- payerTIN: the PAYER'S TIN. Usually an EIN, format ##-####### as printed.
- recipientTIN: the RECIPIENT'S TIN. Usually an SSN, format ###-##-#### as printed.
  Preserve any masking.
- payerName: the PAYER'S name as printed (name only, not address).
- recipientName: the RECIPIENT'S name as printed (name only, not address).
Form-specific notes: a 1099-INT reports interest income. Box 1 is ordinary interest
income; do not confuse it with Box 3 (interest on U.S. Savings Bonds and Treasury
obligations), which is a separate amount. Box 2 is the early withdrawal penalty, not
interest. Federal income tax withheld is Box 4.`

const intSchemas = buildFormSchemas(INT_FIELDS.map((f) => f.key))

export const INT_FORM: FormDefinition = {
  formType: '1099-INT',
  fieldDefs: INT_FIELDS,
  responseSchema: intSchemas.responseSchema,
  validate: intSchemas.validate,
  promptFragment: INT_PROMPT_FRAGMENT,
}
