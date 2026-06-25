import { getFormDefinition, normalizeFormType, supportedFormTypes } from './registry'

test('normalizeFormType canonicalizes common spellings', () => {
  expect(normalizeFormType('w-2')).toBe('W-2')
  expect(normalizeFormType('W2')).toBe('W-2')
  expect(normalizeFormType('1099-nec')).toBe('1099-NEC')
  expect(normalizeFormType('1099 NEC')).toBe('1099-NEC')
  expect(normalizeFormType('1098')).toBe('1098')
})

test('getFormDefinition returns the W-2 and NEC defs, undefined for unsupported', () => {
  expect(getFormDefinition('w-2')?.formType).toBe('W-2')
  expect(getFormDefinition('1099-NEC')?.formType).toBe('1099-NEC')
  expect(getFormDefinition('1098')).toBeUndefined()
  expect(supportedFormTypes).toEqual(expect.arrayContaining(['W-2', '1099-NEC']))
})
