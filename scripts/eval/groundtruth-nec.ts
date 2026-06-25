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

// Obvious-fake EIN: never a plausible real one.
function fakeEin(): string {
  return `12-345678${faker.number.int({ min: 0, max: 9 })}`
}
// Obvious-fake SSN: always starts 123-45-67.
function fakeSsn(): string {
  const last2 = faker.number.int({ min: 0, max: 99 }).toString().padStart(2, '0')
  return `123-45-67${last2}`
}
function maskTin(ssn: string): string {
  return `XXX-XX-${ssn.replace(/\D/g, '').slice(-4)}`
}
// printed is the en-US comma-formatted amount; expected strips the commas.
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
