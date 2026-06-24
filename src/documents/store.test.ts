import { beforeEach, expect, test } from 'vitest'
import * as store from './store'
import type { Document } from '../types'

const doc = (id: string): Document => ({
  id,
  filename: `${id}.png`,
  fileUrl: 'data:image/png;base64,AAAA',
  formType: 'W-2',
  status: 'ready',
  fields: [],
  reviewedAt: null,
})

beforeEach(() => store.clear())

test('put then get returns the stored document', () => {
  const d = doc('a')
  store.put(d)
  expect(store.get('a')).toEqual(d)
})

test('get returns undefined for an unknown id', () => {
  expect(store.get('missing')).toBeUndefined()
})

test('list returns all stored documents', () => {
  store.put(doc('a'))
  store.put(doc('b'))
  expect(store.list().map((d) => d.id).sort()).toEqual(['a', 'b'])
})

test('put with an existing id overwrites', () => {
  store.put(doc('a'))
  store.put({ ...doc('a'), status: 'failed' })
  expect(store.get('a')?.status).toBe('failed')
  expect(store.list()).toHaveLength(1)
})
