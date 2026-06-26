import { toJSON, toCSV, toCombinedJSON, toCombinedCSV } from './export'
import type { Document } from '../types'

const doc: Document = {
  id: 'd1', filename: 'a.pdf', fileUrl: '/x.png', formType: 'W-2',
  status: 'ready', reviewedAt: null,
  fields: [
    { key: 'wages', label: 'Wages, tips, other comp.', box: '1', value: '60,000.00',
      originalValue: '60,000.00', confidence: 0.98, type: 'currency',
      bbox: { page: 1, x: 0, y: 0, w: 10, h: 5 } },
    { key: 'employer', label: 'Employer, Inc.', box: 'c', value: 'A, B Co',
      originalValue: 'A, B Co', confidence: 0.9, type: 'text',
      bbox: { page: 1, x: 0, y: 0, w: 10, h: 5 } },
  ],
}

test('toJSON round-trips the document', () => {
  expect(JSON.parse(toJSON(doc))).toEqual(doc)
})

test('toCSV emits header + a row per field and quotes commas', () => {
  const lines = toCSV(doc).split('\n')
  expect(lines[0]).toBe('key,label,box,value,originalValue,confidence,type,reviewed')
  expect(lines[1]).toBe('wages,"Wages, tips, other comp.",1,"60,000.00","60,000.00",0.98,currency,false')
  expect(lines[2]).toBe('employer,"Employer, Inc.",c,"A, B Co","A, B Co",0.9,text,false')
})

test('toCombinedJSON round-trips an array of documents', () => {
  expect(JSON.parse(toCombinedJSON([doc]))).toEqual([doc])
})

test('toCombinedCSV emits long format: filename,formType then one row per field', () => {
  const lines = toCombinedCSV([doc]).split('\n')
  expect(lines[0]).toBe('filename,formType,fieldKey,fieldLabel,box,value')
  expect(lines[1]).toBe('a.pdf,W-2,wages,"Wages, tips, other comp.",1,"60,000.00"')
  expect(lines[2]).toBe('a.pdf,W-2,employer,"Employer, Inc.",c,"A, B Co"')
})
