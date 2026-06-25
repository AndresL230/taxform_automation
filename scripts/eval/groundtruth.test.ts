import { describe, it, expect } from 'vitest'
import { makeScenario, SCORED_KEYS } from './groundtruth'

describe('makeScenario', () => {
  it('produces all 7 scored fields in field order', () => {
    const { groundTruth } = makeScenario('clean', 1)
    expect(Object.keys(groundTruth.fields)).toEqual([
      'wages',
      'federalWithholding',
      'socialSecurityWages',
      'employerEIN',
      'employeeSSN',
      'employeeName',
      'employerName',
    ])
    expect(SCORED_KEYS).toHaveLength(7)
  })

  it('only emits obviously-fake SSNs', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { groundTruth } = makeScenario('clean', seed)
      expect(groundTruth.fields.employeeSSN.printed).toMatch(/^123-45-67\d{2}$/)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = makeScenario('clean', 7)
    const b = makeScenario('clean', 7)
    expect(a.groundTruth).toEqual(b.groundTruth)
    expect(a.formData).toEqual(b.formData)
  })

  it('zero_withholding leaves box 2 blank and expects empty', () => {
    const { formData, groundTruth } = makeScenario('zero_withholding', 2)
    expect(formData.federalWithholding).toBe('')
    expect(groundTruth.fields.federalWithholding.expectEmpty).toBe(true)
    expect(groundTruth.fields.federalWithholding.expected).toBe('')
  })

  it('masked_ssn prints a mask and expects the mask preserved, not empty', () => {
    const { groundTruth } = makeScenario('masked_ssn', 3)
    const ssn = groundTruth.fields.employeeSSN
    expect(ssn.printed).toMatch(/^XXX-XX-\d{4}$/)
    expect(ssn.expected).toBe(ssn.printed)
    expect(ssn.expectEmpty).toBe(false)
  })

  it('large_values prints comma-formatted amounts and expects them stripped', () => {
    const { groundTruth } = makeScenario('large_values', 4)
    expect(groundTruth.fields.wages.printed).toContain(',')
    expect(groundTruth.fields.wages.expected).toBe('1234567.89')
  })
})
