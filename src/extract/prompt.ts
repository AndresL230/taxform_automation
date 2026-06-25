import { Type } from '@google/genai'
import type { Schema } from '@google/genai'
import { z } from 'zod'
import type { FormDefinition } from './registry'

// --- Classification (first pass) ---
export const CLASSIFY_PROMPT = `You are a tax-document classifier. Identify which U.S. tax
form this document is. Respond with the form type only, using the official name when you
recognize it (for example "W-2", "1099-NEC", "1099-INT", "1098", "1040"). If you cannot
identify it, respond "unknown". Do not extract field values. Return only the JSON object
defined by the schema.`

export const CLASSIFY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: { detectedFormType: { type: Type.STRING } },
  required: ['detectedFormType'],
}

const Classification = z.object({ detectedFormType: z.string() })
export function parseClassification(raw: unknown): { detectedFormType: string } {
  return Classification.parse(raw)
}

// --- Extraction prompt: COMMON scaffold + per-form FIELDS fragment ---
export function buildExtractPrompt(formDef: FormDefinition): string {
  return `You are a precise data-extraction engine for U.S. tax documents. You are given a
single ${formDef.formType} document. Extract only the fields defined below and return them
in the required JSON structure. You transcribe what is printed. You do not calculate,
infer, correct, or complete values.

CORE RULES (these protect a tax preparer who relies on your output):
1. Never guess. If a field is not clearly present and legible, set its value to an empty
   string "" and its confidence at or below 0.3. A blank is recoverable. A confident wrong
   number is a liability.
2. Transcribe exactly what is printed. Do not round, do not reformat amounts beyond the
   normalization rules below, do not fix apparent typos, do not fill in missing digits.
3. If a value is partially obscured or masked, return only the characters you can actually
   read and lower confidence. Do not reconstruct masked digits (a masked SSN printed as
   XXX-XX-1234 is returned as printed).
4. Set isLegible to false if the document is not a ${formDef.formType}, or is too degraded
   to extract reliably.

${formDef.promptFragment}

VALUE FORMATTING:
- Currency: digits and a single decimal point only. Strip the dollar sign and thousands
  separators. Keep cents exactly as printed (84,200.00 becomes "84200.00"). If no cents are
  printed, do not invent them.
- SSN: ###-##-#### as printed. Preserve any masking.
- EIN: ##-####### as printed.
- Text: verbatim, including capitalization.

CONFIDENCE (0 to 1, your honest certainty the value is read correctly):
- 0.95 to 1.0: crisp, unambiguous printed text.
- 0.7 to 0.95: legible with minor noise, slight skew, or light compression.
- 0.3 to 0.7: degraded, faint, handwritten, or ambiguous.
- 0 to 0.3: barely legible, or the field is absent (value "").
Confidence is per field and independent.

BOUNDING BOXES (bbox): give the location of the VALUE itself (the printed data, not the
label, not the box outline) on the page.
- page: 1-based page number. For a single-page form this is always 1.
- x: left edge of the value as a percentage of page WIDTH (0 to 100).
- y: top edge of the value as a percentage of page HEIGHT (0 to 100).
- w: value width as a percentage of page width.
- h: value height as a percentage of page height.
Box the value tightly. If you cannot locate a field, set bbox to {page:1,x:0,y:0,w:0,h:0}
and value to "".

Return only the JSON object defined by the schema. No prose, no markdown.`
}
