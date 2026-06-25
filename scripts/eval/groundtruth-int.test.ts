import { describe, it, expect } from 'vitest'
import { makeIntScenario, INT_SCORED_KEYS } from './groundtruth-int'

describe('makeIntScenario', () => {
  it('produces all 8 scored fields in field order', () => {
    const { groundTruth } = makeIntScenario('clean', 1)
    expect(Object.keys(groundTruth.fields)).toEqual([...INT_SCORED_KEYS])
  })
  it('only emits obviously-fake recipient TINs', () => {
    for (let s = 0; s < 20; s++) {
      const { groundTruth } = makeIntScenario('clean', s)
      expect(groundTruth.fields.recipientTIN.printed).toMatch(/^123-45-67\d{2}$/)
    }
  })
  it('zero_withholding leaves box 4 blank and expects empty', () => {
    const { formData, groundTruth } = makeIntScenario('zero_withholding', 2)
    expect(formData.federalWithholding).toBe('')
    expect(groundTruth.fields.federalWithholding.expectEmpty).toBe(true)
  })
  it('masked_tin preserves the mask, not empty', () => {
    const { groundTruth } = makeIntScenario('masked_tin', 3)
    expect(groundTruth.fields.recipientTIN.printed).toMatch(/^XXX-XX-\d{4}$/)
    expect(groundTruth.fields.recipientTIN.expectEmpty).toBe(false)
  })
})
