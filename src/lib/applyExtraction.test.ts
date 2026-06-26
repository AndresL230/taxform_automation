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

test('failed result carries the server error through and formType reflects detectedFormType', () => {
  const result: ExtractionResult = {
    fields: [], status: 'failed', detectedFormType: '1098',
    error: 'Detected 1098, not a supported form.',
  }
  const doc = applyExtraction(base, result)
  expect(doc.formType).toBe('1098')
  expect(doc.error).toBe('Detected 1098, not a supported form.')
})

test('carries server validationMessages onto the document', () => {
  const result: ExtractionResult = {
    fields: [field('wages', 0.95)], status: 'needs_review', detectedFormType: 'W-2',
    validationMessages: [{ fieldKey: 'wages', message: 'Not a valid dollar amount.' }],
  }
  expect(applyExtraction(base, result).validationMessages).toEqual([
    { fieldKey: 'wages', message: 'Not a valid dollar amount.' },
  ])
})
