import { describe, it, expect } from 'vitest'
import { makeDivScenario, DIV_SCORED_KEYS } from './groundtruth-div'

describe('makeDivScenario', () => {
  it('produces all 8 scored fields in field order', () => {
    const { groundTruth } = makeDivScenario('clean', 1)
    expect(Object.keys(groundTruth.fields)).toEqual([...DIV_SCORED_KEYS])
  })
  it('only emits obviously-fake recipient TINs', () => {
    for (let s = 0; s < 20; s++) {
      const { groundTruth } = makeDivScenario('clean', s)
      expect(groundTruth.fields.recipientTIN.printed).toMatch(/^123-45-67\d{2}$/)
    }
  })
  it('keeps qualified dividends at or below ordinary dividends', () => {
    for (let s = 0; s < 20; s++) {
      const { groundTruth } = makeDivScenario('clean', s)
      const ordinary = Number(groundTruth.fields.ordinaryDividends.expected)
      const qualified = Number(groundTruth.fields.qualifiedDividends.expected)
      expect(qualified).toBeLessThanOrEqual(ordinary)
    }
  })
  it('zero_withholding leaves box 4 blank and expects empty', () => {
    const { formData, groundTruth } = makeDivScenario('zero_withholding', 2)
    expect(formData.federalWithholding).toBe('')
    expect(groundTruth.fields.federalWithholding.expectEmpty).toBe(true)
  })
  it('masked_tin preserves the mask, not empty', () => {
    const { groundTruth } = makeDivScenario('masked_tin', 3)
    expect(groundTruth.fields.recipientTIN.printed).toMatch(/^XXX-XX-\d{4}$/)
    expect(groundTruth.fields.recipientTIN.expectEmpty).toBe(false)
  })
})
