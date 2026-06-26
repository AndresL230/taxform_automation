import { isBBoxRenderable, locateField } from './bbox'
import type { Field } from '../types'

const fld = (over: Partial<Field>): Field => ({
  key: 'k', label: 'k', box: '1', value: '100.00', originalValue: '100.00', confidence: 0.95, type: 'currency',
  bbox: { page: 1, x: 10, y: 10, w: 20, h: 5 }, ...over,
})

test('isBBoxRenderable: in-range true, empty box false, overflow/negative false', () => {
  expect(isBBoxRenderable({ page: 1, x: 10, y: 10, w: 20, h: 5 })).toBe(true)
  expect(isBBoxRenderable({ page: 1, x: 0, y: 0, w: 0, h: 0 })).toBe(false)
  expect(isBBoxRenderable({ page: 1, x: 90, y: 10, w: 20, h: 5 })).toBe(false) // x+w > 100
  expect(isBBoxRenderable({ page: 1, x: -1, y: 10, w: 5, h: 5 })).toBe(false)
})

test('locateField: value-bearing + renderable -> highlight', () => {
  const r = locateField(fld({}))
  expect(r.highlight).toEqual({ page: 1, x: 10, y: 10, w: 20, h: 5 })
  expect(r.sourceMissing).toBe(false)
})

test('locateField: value-bearing + bad bbox -> sourceMissing', () => {
  const r = locateField(fld({ bbox: { page: 1, x: 200, y: 10, w: 20, h: 5 } }))
  expect(r.highlight).toBeNull()
  expect(r.sourceMissing).toBe(true)
})

test('locateField: empty value -> no-op', () => {
  const r = locateField(fld({ value: '', bbox: { page: 1, x: 0, y: 0, w: 0, h: 0 } }))
  expect(r.highlight).toBeNull()
  expect(r.sourceMissing).toBe(false)
})
