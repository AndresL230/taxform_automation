import { buildDocument, buildFormSchemas, type ParsedExtraction } from './build'
import type { FieldDef } from '../types'

const FIELDS = [
  { key: 'a', box: '1', label: 'Alpha', type: 'currency' },
  { key: 'b', box: '', label: 'Bravo', type: 'text' },
] as const satisfies readonly FieldDef[]

const ex = (value: string, confidence: number) => ({ value, confidence, bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 } })
const ok = (): ParsedExtraction['fields'] => ({ a: ex('100.00', 0.95), b: ex('Bee', 0.9) })

test('buildDocument joins fieldDefs into the frozen Field shape with originalValue === value', () => {
  const { fields, status } = buildDocument({ isLegible: true, fields: ok() }, { fieldDefs: FIELDS })
  expect(status).toBe('ready')
  expect(fields).toHaveLength(2)
  expect(fields[0]).toEqual({
    key: 'a', label: 'Alpha', box: '1', value: '100.00', originalValue: '100.00',
    confidence: 0.95, type: 'currency', bbox: { page: 1, x: 1, y: 2, w: 3, h: 4 },
  })
  for (const f of fields)
    expect(Object.keys(f).sort()).toEqual(
      ['bbox', 'box', 'confidence', 'key', 'label', 'originalValue', 'type', 'value'].sort(),
    )
})

test('status tiers: failed when not legible, needs_review on empty or low confidence', () => {
  expect(buildDocument({ isLegible: false, fields: ok() }, { fieldDefs: FIELDS }).status).toBe('failed')
  const lowConf = { ...ok(), a: ex('100.00', 0.5) }
  expect(buildDocument({ isLegible: true, fields: lowConf }, { fieldDefs: FIELDS }).status).toBe('needs_review')
  const empty = { ...ok(), b: ex('', 0.95) }
  expect(buildDocument({ isLegible: true, fields: empty }, { fieldDefs: FIELDS }).status).toBe('needs_review')
})

test('buildFormSchemas validate accepts a well-formed payload and rejects a missing field', () => {
  const { validate } = buildFormSchemas(['a', 'b'])
  expect(validate({ isLegible: true, fields: ok() }).isLegible).toBe(true)
  expect(() => validate({ isLegible: true, fields: { a: ex('1', 0.9) } })).toThrow()
})

test('a non-empty crossChecks result forces needs_review independently of confidence', () => {
  const formDef = { fieldDefs: FIELDS, crossChecks: () => [{ fieldKey: 'a', message: 'bad' }] }
  const { status, validationMessages } = buildDocument({ isLegible: true, fields: ok() }, formDef)
  expect(status).toBe('needs_review')
  expect(validationMessages).toEqual([{ fieldKey: 'a', message: 'bad' }])
})

test('buildDocument returns an empty validationMessages when no crossChecks', () => {
  const { validationMessages } = buildDocument({ isLegible: true, fields: ok() }, { fieldDefs: FIELDS })
  expect(validationMessages).toEqual([])
})
