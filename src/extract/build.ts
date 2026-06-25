import { Type } from '@google/genai'
import type { Schema } from '@google/genai'
import { z } from 'zod'
import type { DocStatus, Field, FieldDef } from '../types'

// Shared per-field validated shape, identical across forms.
const BBoxZ = z.object({
  page: z.number().int(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})
export const Extracted = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: BBoxZ,
})
export type Extracted = z.infer<typeof Extracted>

export type ParsedExtraction = { isLegible: boolean; fields: Record<string, Extracted> }

// Google response-schema fragment for one extracted field. No numeric min/max/int
// constraints; Zod enforces those on our side.
const extractedSchema: Schema = {
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

// Build the Gemini response schema and the Zod validator for a form from its field
// keys. The extract response is uniform: { isLegible, fields: { <key>: extracted } }.
export function buildFormSchemas(fieldKeys: readonly string[]): {
  responseSchema: Schema
  validate: (raw: unknown) => ParsedExtraction
} {
  const fieldProps: Record<string, Schema> = {}
  for (const k of fieldKeys) fieldProps[k] = extractedSchema
  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      isLegible: { type: Type.BOOLEAN },
      fields: { type: Type.OBJECT, properties: fieldProps, required: [...fieldKeys] },
    },
    required: ['isLegible', 'fields'],
  }
  const zodFields: Record<string, z.ZodTypeAny> = {}
  for (const k of fieldKeys) zodFields[k] = Extracted
  const validator = z.object({ isLegible: z.boolean(), fields: z.object(zodFields) })
  // The dynamic-record shape erases per-field value types to unknown; the cast is sound
  // because every zodFields entry validates as Extracted at runtime.
  return { responseSchema, validate: (raw: unknown): ParsedExtraction => validator.parse(raw) as ParsedExtraction }
}

// Backend join. The model never generates the field constants. Identical join and
// status logic for every form, driven by formDef.fieldDefs.
export function buildDocument(
  parsed: ParsedExtraction,
  formDef: { fieldDefs: readonly FieldDef[] },
): { fields: Field[]; status: DocStatus } {
  const fields: Field[] = formDef.fieldDefs.map((f): Field => {
    const ex = parsed.fields[f.key]
    return {
      key: f.key,
      label: f.label,
      box: f.box,
      value: ex.value,
      originalValue: ex.value,
      confidence: ex.confidence,
      type: f.type,
      // bbox normalization seam: the prompt asks Gemini for 0 to 100 x/y/w/h, so this
      // is an identity pass-through today. Any future conversion (for example 0 to 1000
      // or corner coordinates) goes HERE, shared by all forms, so fixtures stay 0 to 100
      // and production matches.
      bbox: ex.bbox,
    }
  })

  let status: DocStatus
  if (!parsed.isLegible) {
    status = 'failed'
  } else if (fields.some((f) => f.value === '' || f.confidence < 0.7)) {
    status = 'needs_review'
  } else {
    status = 'ready'
  }

  return { fields, status }
}
