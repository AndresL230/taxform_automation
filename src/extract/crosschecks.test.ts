import { crossChecksFor } from './crosschecks'
import type { Field } from '../types'

const f = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: '', originalValue: '', confidence: 0.95, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 }, ...over,
})

test('crossChecksFor W-2 runs arithmetic and format checks', () => {
  const fields = [
    f({ key: 'socialSecurityWages', type: 'currency', value: '60000.00' }),
    f({ key: 'socialSecurityTaxWithheld', type: 'currency', value: '3000.00' }), // expected 3720
  ]
  expect(crossChecksFor('W-2')(fields).map((m) => m.fieldKey)).toContain('socialSecurityTaxWithheld')
})

test('crossChecksFor W-2 returns none for consistent values', () => {
  const fields = [
    f({ key: 'socialSecurityWages', type: 'currency', value: '60000.00' }),
    f({ key: 'socialSecurityTaxWithheld', type: 'currency', value: '3720.00' }),
  ]
  expect(crossChecksFor('W-2')(fields)).toEqual([])
})

test('crossChecksFor 1099 forms are format-only', () => {
  const fields = [
    f({ key: 'payerTIN', type: 'ein', value: '1234' }),               // bad EIN
    f({ key: 'recipientTIN', type: 'ssn', value: '123-45-6789' }),    // valid
  ]
  expect(crossChecksFor('1099-NEC')(fields).map((m) => m.fieldKey)).toEqual(['payerTIN'])
})
