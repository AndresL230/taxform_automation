import { faker } from '@faker-js/faker'
import type { FieldType } from '../../src/types'
import type { FieldGT, GroundTruth } from './types'

export type DivScenario = 'clean' | 'zero_withholding' | 'masked_tin' | 'large_values'

// Scored keys in the same order as DIV_FIELDS in src/extract/div.ts.
export const DIV_SCORED_KEYS = [
  'ordinaryDividends',
  'qualifiedDividends',
  'totalCapitalGain',
  'federalWithholding',
  'payerTIN',
  'recipientTIN',
  'payerName',
  'recipientName',
] as const

export type DivFormData = {
  ordinaryDividends: string
  qualifiedDividends: string
  totalCapitalGain: string
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

export function makeDivScenario(
  scenario: DivScenario,
  seed: number,
): { formData: DivFormData; groundTruth: GroundTruth } {
  faker.seed(seed)
  const payerName = faker.company.name()
  const recipientName = faker.person.fullName()
  const addr = () =>
    `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode('#####')}`

  const ordinaryN = scenario === 'large_values' ? 1234567.89 : faker.number.int({ min: 200, max: 40000 })
  const ordinary = money(ordinaryN)
  // Qualified dividends are a subset of ordinary (box 1b <= box 1a).
  const qualifiedN = Math.round(ordinaryN * 0.85 * 100) / 100
  const qualified = money(qualifiedN)
  const capGainN = scenario === 'large_values' ? 98765.43 : faker.number.int({ min: 0, max: 8000 })
  const capGain = money(capGainN)
  const fedN = scenario === 'large_values' ? 246913.58 : Math.round(ordinaryN * 0.1 * 100) / 100
  const fed = money(fedN)

  const payerTIN = fakeEin()
  const rawTin = fakeSsn()
  const recipientTIN = scenario === 'masked_tin' ? maskTin(rawTin) : rawTin

  const formData: DivFormData = {
    ordinaryDividends: ordinary.printed,
    qualifiedDividends: qualified.printed,
    totalCapitalGain: capGain.printed,
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
    ordinaryDividends: gt('ordinaryDividends', '1a', 'currency', ordinary.printed, ordinary.expected),
    qualifiedDividends: gt('qualifiedDividends', '1b', 'currency', qualified.printed, qualified.expected),
    totalCapitalGain: gt('totalCapitalGain', '2a', 'currency', capGain.printed, capGain.expected),
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
