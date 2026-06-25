import { buildFormSchemas } from './build'
import type { FormDefinition } from './registry'
import type { FieldDef } from '../types'

export const DIV_FIELDS = [
  { key: 'ordinaryDividends', box: '1a', label: 'Total ordinary dividends', type: 'currency' },
  { key: 'qualifiedDividends', box: '1b', label: 'Qualified dividends', type: 'currency' },
  { key: 'totalCapitalGain', box: '2a', label: 'Total capital gain distr.', type: 'currency' },
  { key: 'federalWithholding', box: '4', label: 'Federal income tax withheld', type: 'currency' },
  { key: 'payerTIN', box: '', label: "Payer's TIN", type: 'ein' },
  { key: 'recipientTIN', box: '', label: "Recipient's TIN", type: 'ssn' },
  { key: 'payerName', box: '', label: "Payer's name", type: 'text' },
  { key: 'recipientName', box: '', label: "Recipient's name", type: 'text' },
] as const satisfies readonly FieldDef[]

const DIV_PROMPT_FRAGMENT = `FIELDS TO EXTRACT (1099-DIV):
- ordinaryDividends: Box 1a, "Total ordinary dividends". Currency.
- qualifiedDividends: Box 1b, "Qualified dividends". Currency.
- totalCapitalGain: Box 2a, "Total capital gain distr.". Currency.
- federalWithholding: Box 4, "Federal income tax withheld". Currency.
- payerTIN: the PAYER'S TIN. Usually an EIN, format ##-####### as printed.
- recipientTIN: the RECIPIENT'S TIN. Usually an SSN, format ###-##-#### as printed.
  Preserve any masking.
- payerName: the PAYER'S name as printed (name only, not address).
- recipientName: the RECIPIENT'S name as printed (name only, not address).
Form-specific notes: a 1099-DIV reports dividends and distributions. Box 1a is total
ordinary dividends; Box 1b qualified dividends is a SUBSET of 1a, not an additional
amount, so 1b is typically less than or equal to 1a. Box 2a is total capital gain
distributions. Do not confuse the lettered sub-boxes (1a vs 1b, 2a vs 2b, 2c, 2d).
Federal income tax withheld is Box 4.`

const divSchemas = buildFormSchemas(DIV_FIELDS.map((f) => f.key))

export const DIV_FORM: FormDefinition = {
  formType: '1099-DIV',
  fieldDefs: DIV_FIELDS,
  responseSchema: divSchemas.responseSchema,
  validate: divSchemas.validate,
  promptFragment: DIV_PROMPT_FRAGMENT,
}
