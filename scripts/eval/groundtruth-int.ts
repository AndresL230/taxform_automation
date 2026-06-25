import { faker } from '@faker-js/faker'
import type { FieldType } from '../../src/types'
import type { FieldGT, GroundTruth } from './types'

export type IntScenario = 'clean' | 'zero_withholding' | 'masked_tin' | 'large_values'

// Scored keys in the same order as INT_FIELDS in src/extract/int.ts.
export const INT_SCORED_KEYS = [
  'interestIncome',
  'earlyWithdrawalPenalty',
  'interestUSSavingsBonds',
  'federalWithholding',
  'payerTIN',
  'recipientTIN',
  'payerName',
  'recipientName',
] as const

export type IntFormData = {
  interestIncome: string
  earlyWithdrawalPenalty: string
  interestUSSavingsBonds: string
  federalWithholding: string
  payerTIN: string
  recipientTIN: string
  payerName: string
  recipientName: string
  // supporting fields for realism, not scored
  payerAddress: string
  recipientAddress: string
  accountNumber: string
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

export function makeIntScenario(
  scenario: IntScenario,
  seed: number,
): { formData: IntFormData; groundTruth: GroundTruth } {
  faker.seed(seed)
  const payerName = faker.company.name()
  const recipientName = faker.person.fullName()
  const addr = () =>
    `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode('#####')}`

  const interestN = scenario === 'large_values' ? 1234567.89 : faker.number.int({ min: 50, max: 9000 })
  const interest = money(interestN)
  const penalty = money(scenario === 'large_values' ? 12345.67 : faker.number.int({ min: 0, max: 250 }))
  const savings = money(scenario === 'large_values' ? 98765.43 : faker.number.int({ min: 0, max: 4000 }))
  const fedN = scenario === 'large_values' ? 246913.58 : Math.round(interestN * 0.1 * 100) / 100
  const fed = money(fedN)

  const payerTIN = fakeEin()
  const rawTin = fakeSsn()
  const recipientTIN = scenario === 'masked_tin' ? maskTin(rawTin) : rawTin

  const formData: IntFormData = {
    interestIncome: interest.printed,
    earlyWithdrawalPenalty: penalty.printed,
    interestUSSavingsBonds: savings.printed,
    federalWithholding: scenario === 'zero_withholding' ? '' : fed.printed,
    payerTIN,
    recipientTIN,
    payerName,
    recipientName,
    payerAddress: addr(),
    recipientAddress: addr(),
    accountNumber: faker.string.alphanumeric(10).toUpperCase(),
  }

  const fields: Record<string, FieldGT> = {
    interestIncome: gt('interestIncome', '1', 'currency', interest.printed, interest.expected),
    earlyWithdrawalPenalty: gt('earlyWithdrawalPenalty', '2', 'currency', penalty.printed, penalty.expected),
    interestUSSavingsBonds: gt('interestUSSavingsBonds', '3', 'currency', savings.printed, savings.expected),
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
