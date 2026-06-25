// @vitest-environment node
import { expect, test, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: { extractCalls: 0, classifyType: 'W-2', extractPayload: null as unknown },
}))

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>()
  return {
    ...actual,
    GoogleGenAI: vi.fn(function () {
      return {
        models: {
          generateContent: vi.fn(async (req: any) => {
            const text = req.contents[0].parts[0].text as string
            if (text.includes('tax-document classifier')) {
              return { text: JSON.stringify({ detectedFormType: state.classifyType }) }
            }
            state.extractCalls++
            return { text: JSON.stringify(state.extractPayload) }
          }),
        },
      }
    }),
  }
})

import { extractDocument } from './extract'

const ex = (value: string, confidence = 0.95) => ({ value, confidence, bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 } })
const file = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }

test('W-2 detection routes to the W-2 def and returns 7 fields', async () => {
  state.classifyType = 'W-2'
  state.extractCalls = 0
  state.extractPayload = {
    isLegible: true,
    fields: {
      wages: ex('58500.00'), federalWithholding: ex('7920.00'), socialSecurityWages: ex('60000.00'),
      employerEIN: ex('94-2719303'), employeeSSN: ex('532-19-7766'), employeeName: ex('Jordan A. Reyes'),
      employerName: ex('Northwind Logistics LLC'),
    },
  }
  const result = await extractDocument(file, 'k')
  expect(result.status).toBe('ready')
  expect(result.detectedFormType).toBe('W-2')
  expect(result.fields).toHaveLength(7)
})

test('1099-NEC detection routes to the NEC def and returns 6 fields in order', async () => {
  state.classifyType = '1099-NEC'
  state.extractCalls = 0
  state.extractPayload = {
    isLegible: true,
    fields: {
      nonemployeeCompensation: ex('24500.00'), federalWithholding: ex('0.00'),
      payerTIN: ex('12-3456789'), recipientTIN: ex('123-45-6789'),
      payerName: ex('Globex Corporation'), recipientName: ex('Dana Lee'),
    },
  }
  const result = await extractDocument(file, 'k')
  expect(result.status).toBe('ready')
  expect(result.detectedFormType).toBe('1099-NEC')
  expect(result.fields.map((f) => f.key)).toEqual([
    'nonemployeeCompensation', 'federalWithholding', 'payerTIN', 'recipientTIN', 'payerName', 'recipientName',
  ])
})

test('1099-INT detection routes to the INT def and returns 8 fields in order', async () => {
  state.classifyType = '1099-INT'
  state.extractCalls = 0
  state.extractPayload = {
    isLegible: true,
    fields: {
      interestIncome: ex('1284.55'), earlyWithdrawalPenalty: ex('0.00'),
      interestUSSavingsBonds: ex('0.00'), federalWithholding: ex('0.00'),
      payerTIN: ex('98-7654321'), recipientTIN: ex('123-45-6789'),
      payerName: ex('First National Bank'), recipientName: ex('Dana Lee'),
    },
  }
  const result = await extractDocument(file, 'k')
  expect(result.status).toBe('ready')
  expect(result.detectedFormType).toBe('1099-INT')
  expect(result.fields.map((f) => f.key)).toEqual([
    'interestIncome', 'earlyWithdrawalPenalty', 'interestUSSavingsBonds', 'federalWithholding',
    'payerTIN', 'recipientTIN', 'payerName', 'recipientName',
  ])
})

test('an unsupported detected type fails without making an extract call', async () => {
  state.classifyType = '1098'
  state.extractCalls = 0
  state.extractPayload = null
  const result = await extractDocument(file, 'k')
  expect(result.status).toBe('failed')
  expect(result.detectedFormType).toBe('1098')
  expect(result.error).toBe('Detected 1098, not a supported form.')
  expect(result.fields).toHaveLength(0)
  expect(state.extractCalls).toBe(0)
})
