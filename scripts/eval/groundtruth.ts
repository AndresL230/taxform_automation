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
