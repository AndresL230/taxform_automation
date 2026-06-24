import { GoogleGenAI, Type } from '@google/genai'
import type { Schema } from '@google/genai'
import { z } from 'zod'
import { toBase64 } from '../lib/bytes'
import type { Document, DocStatus, Field } from '../types'

const MODEL = 'gemini-3.5-flash'

// --- Validation schema (Zod). Also the source of the W2Extraction type. ---
const BBox = z.object({
  page: z.number().int(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})
const Extracted = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: BBox,
})
const W2Extraction = z.object({
  detectedFormType: z.string(),
  isLegibleW2: z.boolean(),
  fields: z.object({
    wages: Extracted,
    federalWithholding: Extracted,
    socialSecurityWages: Extracted,
    employerEIN: Extracted,
    employeeSSN: Extracted,
    employeeName: Extracted,
    employerName: Extracted,
  }),
})
export type W2Extraction = z.infer<typeof W2Extraction>

// --- Model-facing response schema (Google Schema via Type enum). ---
// Intentionally omits numeric min/max/int constraints; Zod enforces those on our side.
const extracted: Schema = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    bbox: {
      type: Type.OBJECT,
      properties: {
        page: { type: Type.NUMBER },
        x: { type: Type.NUMBER },
        y: { type: Type.NUMBER },
        w: { type: Type.NUMBER },
        h: { type: Type.NUMBER },
      },
      required: ['page', 'x', 'y', 'w', 'h'],
    },
  },
  required: ['value', 'confidence', 'bbox'],
}
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    detectedFormType: { type: Type.STRING },
    isLegibleW2: { type: Type.BOOLEAN },
    fields: {
      type: Type.OBJECT,
      properties: {
        wages: extracted,
        federalWithholding: extracted,
        socialSecurityWages: extracted,
        employerEIN: extracted,
        employeeSSN: extracted,
        employeeName: extracted,
        employerName: extracted,
      },
      required: [
        'wages',
        'federalWithholding',
        'socialSecurityWages',
        'employerEIN',
        'employeeSSN',
        'employeeName',
        'employerName',
      ],
    },
  },
  required: ['detectedFormType', 'isLegibleW2', 'fields'],
}

// --- Backend join. The model never generates these constants. ---
export const W2_FIELDS = [
  { key: 'wages', box: '1', label: 'Wages, tips, other comp.', type: 'currency' },
  { key: 'federalWithholding', box: '2', label: 'Federal income tax withheld', type: 'currency' },
  { key: 'socialSecurityWages', box: '3', label: 'Social security wages', type: 'currency' },
  { key: 'employerEIN', box: 'b', label: 'Employer EIN', type: 'ein' },
  { key: 'employeeSSN', box: 'a', label: 'Employee SSN', type: 'ssn' },
  { key: 'employeeName', box: 'e', label: 'Employee name', type: 'text' },
  { key: 'employerName', box: 'c', label: 'Employer name', type: 'text' },
] as const

const PROMPT = `You are a precise data-extraction engine for U.S. tax documents. You are given a
single document (a W-2 wage statement, or possibly something else). Extract only
the fields defined below and return them in the required JSON structure. You
transcribe what is printed. You do not calculate, infer, correct, or complete
values.

CORE RULES (these protect a tax preparer who relies on your output):
1. Never guess. If a field is not clearly present and legible, set its value to
   an empty string "" and its confidence at or below 0.3. A blank is recoverable.
   A confident wrong number is a liability.
2. Transcribe exactly what is printed. Do not round, do not reformat amounts
   beyond the normalization rules below, do not fix apparent typos, do not fill
   in missing digits.
3. If a value is partially obscured or masked, return only the characters you can
   actually read and lower confidence. Do not reconstruct masked digits (a masked
   SSN printed as XXX-XX-1234 is returned as printed).
4. Set isLegibleW2 to false if the document is not a W-2, or is too degraded to
   extract reliably. Always fill detectedFormType with your best identification
   ("1099-NEC", "1098", "unknown", etc.).

FIELDS TO EXTRACT (W-2):
- wages: Box 1, "Wages, tips, other compensation". Currency.
- federalWithholding: Box 2, "Federal income tax withheld". Currency.
- socialSecurityWages: Box 3, "Social security wages". Currency.
- employerEIN: Box b, the Employer Identification Number. Format ##-#######.
- employeeSSN: Box a, the employee's Social Security Number. Format ###-##-####.
- employeeName: Box e, the employee's full name as printed.
- employerName: Box c, the employer's name as printed (name only, not address).

VALUE FORMATTING:
- Currency: digits and a single decimal point only. Strip the dollar sign and
  thousands separators. Keep cents exactly as printed (84,200.00 becomes
  "84200.00"). If no cents are printed, do not invent them.
- SSN: ###-##-#### as printed. Preserve any masking.
- EIN: ##-####### as printed.
- Text: verbatim, including capitalization.

CONFIDENCE (0 to 1, your honest certainty the value is read correctly):
- 0.95 to 1.0: crisp, unambiguous printed text.
- 0.7 to 0.95: legible with minor noise, slight skew, or light compression.
- 0.3 to 0.7: degraded, faint, handwritten, or ambiguous.
- 0 to 0.3: barely legible, or the field is absent (value "").
Confidence is per field and independent.

BOUNDING BOXES (bbox): give the location of the VALUE itself (the printed data,
not the label, not the box outline) on the page.
- page: 1-based page number. For a single-page W-2 this is always 1.
- x: left edge of the value as a percentage of page WIDTH (0 to 100).
- y: top edge of the value as a percentage of page HEIGHT (0 to 100).
- w: value width as a percentage of page width.
- h: value height as a percentage of page height.
Box the value tightly. If you cannot locate a field, set bbox to
{page:1,x:0,y:0,w:0,h:0} and value to "".

Return only the JSON object defined by the schema. No prose, no markdown.`

export function buildW2Document(parsed: W2Extraction): { fields: Field[]; status: DocStatus } {
  const fields: Field[] = W2_FIELDS.map((f): Field => {
    const ex = parsed.fields[f.key]
    return {
      key: f.key,
      label: f.label,
      box: f.box,
      value: ex.value,
      originalValue: ex.value,
      confidence: ex.confidence,
      type: f.type,
      bbox: ex.bbox,
    }
  })

  let status: DocStatus
  if (!parsed.isLegibleW2) {
    status = 'failed'
  } else if (fields.some((f) => f.value === '' || f.confidence < 0.7)) {
    status = 'needs_review'
  } else {
    status = 'ready'
  }

  return { fields, status }
}

export async function extractW2(
  file: { bytes: ArrayBuffer | Uint8Array; mimeType: string },
  apiKey: string,
): Promise<Document> {
  const base = {
    id: crypto.randomUUID(),
    filename: '',
    fileUrl: '',
    formType: 'W-2',
    reviewedAt: null,
  } as const

  try {
    const data = toBase64(file.bytes)
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { role: 'user', parts: [{ text: PROMPT }, { inlineData: { data, mimeType: file.mimeType } }] },
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    })
    const raw = response.text
    if (!raw) throw new Error('Empty response from model')
    const parsed = W2Extraction.parse(JSON.parse(raw))
    const { fields, status } = buildW2Document(parsed)
    return { ...base, status, fields }
  } catch (err) {
    return {
      ...base,
      status: 'failed',
      fields: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
