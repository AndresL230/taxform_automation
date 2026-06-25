import { describe, it, expect } from 'vitest'
import type { BBox, Field } from '../../src/types'
import type { GroundTruth } from './types'
import { bboxOk, scoreField, scoreVariant, renderResultsTable } from './score'

const okBox: BBox = { page: 1, x: 10, y: 20, w: 15, h: 5 }

function field(over: Partial<Field>): Field {
  return {
    key: 'wages',
    label: 'Wages',
    box: '1',
    value: '84200.00',
    originalValue: '84200.00',
    confidence: 0.95,
    type: 'currency',
    bbox: okBox,
    ...over,
  }
}

describe('bboxOk', () => {
  it('accepts an in-range, on-page box', () => {
    expect(bboxOk(okBox).ok).toBe(true)
  })
  it('flags an out-of-range coordinate (Gemini 0 to 1000 bug signal)', () => {
    const r = bboxOk({ page: 1, x: 500, y: 20, w: 15, h: 5 })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('x=500')
  })
  it('flags an off-page box', () => {
    const r = bboxOk({ page: 1, x: 90, y: 20, w: 30, h: 5 })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toContain('off-page')
  })
  it('flags a wrong page', () => {
    expect(bboxOk({ page: 2, x: 1, y: 1, w: 1, h: 1 }).ok).toBe(false)
  })
})

describe('scoreField', () => {
  const gtWages = { key: 'wages', box: '1', type: 'currency' as const, printed: '84,200.00', expected: '84200.00', expectEmpty: false }

  it('passes on a normalized match', () => {
    expect(scoreField(gtWages, field({ value: '$84,200.00' })).pass).toBe(true)
  })
  it('fails on a mismatch', () => {
    expect(scoreField(gtWages, field({ value: '84200' })).pass).toBe(false)
  })
  it('treats an absent field as empty value', () => {
    expect(scoreField(gtWages, undefined).pass).toBe(false)
  })

  const gtEmpty = { key: 'federalWithholding', box: '2', type: 'currency' as const, printed: '', expected: '', expectEmpty: true }
  it('passes when an empty-expected field is empty', () => {
    expect(scoreField(gtEmpty, field({ key: 'federalWithholding', value: '' })).pass).toBe(true)
  })
  it('fails when an empty-expected field is hallucinated', () => {
    const s = scoreField(gtEmpty, field({ key: 'federalWithholding', value: '1234.00' }))
    expect(s.pass).toBe(false)
    expect(s.note).toContain('HALLUCINATED')
  })
})

describe('scoreVariant + renderResultsTable', () => {
  const gt: GroundTruth = {
    scenario: 'clean',
    fields: {
      wages: { key: 'wages', box: '1', type: 'currency', printed: '84,200.00', expected: '84200.00', expectEmpty: false },
      employeeName: { key: 'employeeName', box: 'e', type: 'text', printed: 'Jane Roe', expected: 'Jane Roe', expectEmpty: false },
    },
  }
  const result = {
    fields: [
      field({ key: 'wages', value: '84200.00', confidence: 0.9, bbox: okBox }),
      field({ key: 'employeeName', type: 'text', value: 'Jane Roe', confidence: 0.8, bbox: { page: 1, x: 200, y: 5, w: 10, h: 4 } }),
    ],
    status: 'ready',
    detectedFormType: 'W-2',
  }

  it('aggregates pass count, mean confidence, and bbox violations', () => {
    const v = scoreVariant('clean', gt, result)
    expect(v.passCount).toBe(2)
    expect(v.passRate).toBe(1)
    expect(v.meanConfidence).toBeCloseTo(0.85, 2)
    expect(v.bboxOk).toBe(false) // employeeName x=200 is out of range
    expect(v.bboxViolations[0]).toContain('employeeName')
  })

  it('renders a markdown table with a header row', () => {
    const v = scoreVariant('clean', gt, result)
    const table = renderResultsTable([v])
    expect(table).toContain('| variant |')
    expect(table).toContain('clean')
  })
})
