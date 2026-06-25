import { GoogleGenAI } from '@google/genai'
import type { Schema } from '@google/genai'
import { toBase64 } from '../lib/bytes'
import type { ExtractionResult } from '../types'
import { buildDocument } from './build'
import { getFormDefinition, type FormDefinition } from './registry'
import { CLASSIFY_PROMPT, CLASSIFY_SCHEMA, buildExtractPrompt, parseClassification } from './prompt'

const MODEL = 'gemini-3.5-flash'

type FileInput = { bytes: ArrayBuffer | Uint8Array; mimeType: string }

async function callModel(
  ai: GoogleGenAI,
  prompt: string,
  schema: Schema,
  inline: { data: string; mimeType: string },
): Promise<unknown> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { role: 'user', parts: [{ text: prompt }, { inlineData: { data: inline.data, mimeType: inline.mimeType } }] },
    ],
    config: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  })
  const raw = response.text
  if (!raw) throw new Error('Empty response from model')
  return JSON.parse(raw)
}

export async function extractDocument(file: FileInput, apiKey: string): Promise<ExtractionResult> {
  try {
    const ai = new GoogleGenAI({ apiKey })
    const inline = { data: toBase64(file.bytes), mimeType: file.mimeType }

    // 1. Classify (cheap first pass).
    const { detectedFormType } = parseClassification(await callModel(ai, CLASSIFY_PROMPT, CLASSIFY_SCHEMA, inline))

    // 2. Route to a form definition.
    const formDef: FormDefinition | undefined = getFormDefinition(detectedFormType)
    if (!formDef) {
      return {
        fields: [],
        status: 'failed',
        detectedFormType,
        error: `Detected ${detectedFormType}, not a supported form.`,
      }
    }

    // 3. Extract with the form's own schema and prompt.
    const parsed = formDef.validate(await callModel(ai, buildExtractPrompt(formDef), formDef.responseSchema, inline))

    // 4. Join + status.
    const { fields, status } = buildDocument(parsed, formDef)
    const error = status === 'failed' ? `Detected ${formDef.formType}, could not extract it reliably.` : undefined
    return { fields, status, detectedFormType: formDef.formType, ...(error ? { error } : {}) }
  } catch (err) {
    return {
      fields: [],
      status: 'failed',
      detectedFormType: 'unknown',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
