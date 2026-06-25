import { applyExtraction, type DocumentBase } from './applyExtraction'
import type { ExtractionResult, Field } from '../types'

const base: DocumentBase = { id: 'd1', filename: 'a.png', fileUrl: 'blob:x', reviewedAt: null }
const field = (key: string, confidence: number): Field => ({
  key, label: key, box: '1', value: 'v', originalValue: 'v', confidence, type: 'text',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 },
})

test('ready result passes through and preserves base identity', () => {
  const result: ExtractionResult = { fields: [field('wages', 0.95)], status: 'ready', detectedFormType: 'W-2' }
  const doc = applyExtraction(base, result)
  expect(doc).toEqual({
    id: 'd1', filename: 'a.png', fileUrl: 'blob:x', reviewedAt: null,
    formType: 'W-2', status: 'ready', fields: result.fields,
  })
  expect(doc.error).toBeUndefined()
})

test('needs_review passes through with fields', () => {
  const result: ExtractionResult = { fields: [field('wages', 0.5)], status: 'needs_review', detectedFormType: 'W-2' }
  expect(applyExtraction(base, result).status).toBe('needs_review')
})

test('failed with a server error keeps that error', () => {
  const result: ExtractionResult = { fields: [], status: 'failed', detectedFormType: 'unknown', error: 'Empty response from model' }
  expect(applyExtraction(base, result).error).toBe('Empty response from model')
})

test('failed without a server error derives the detectedFormType message', () => {
  const result: ExtractionResult = { fields: [], status: 'failed', detectedFormType: '1099-NEC' }
  expect(applyExtraction(base, result).error).toBe('Detected 1099-NEC, not a legible W-2.')
})
