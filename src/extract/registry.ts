import type { Schema } from '@google/genai'
import type { FieldDef, Field, ValidationMessage } from '../types'
import type { ParsedExtraction } from './build'
import { W2_FORM } from './w2'
import { NEC_FORM } from './nec'
import { INT_FORM } from './int'
import { DIV_FORM } from './div'

export type FormDefinition = {
  formType: string
  fieldDefs: readonly FieldDef[]
  responseSchema: Schema
  validate: (raw: unknown) => ParsedExtraction
  promptFragment: string
  crossChecks?: (fields: Field[]) => ValidationMessage[]
}

// Registry keyed by canonical form type. Adding a form is a new entry here plus its
// src/extract/<form>.ts definition, no changes to build/prompt/extract.
export const FORM_REGISTRY: Record<string, FormDefinition> = {
  [W2_FORM.formType]: W2_FORM,
  [NEC_FORM.formType]: NEC_FORM,
  [INT_FORM.formType]: INT_FORM,
  [DIV_FORM.formType]: DIV_FORM,
}

export const supportedFormTypes = Object.keys(FORM_REGISTRY)

// Map common model spellings to a canonical registry key. Unknown input returns
// trimmed as-is, so the caller can report "Detected {type}, not a supported form.".
export function normalizeFormType(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/[\s_]+/g, '-')
  if (compact === 'W-2' || compact === 'W2') return 'W-2'
  if (compact === '1099-NEC' || compact === '1099NEC') return '1099-NEC'
  if (compact === '1099-INT' || compact === '1099INT') return '1099-INT'
  if (compact === '1099-DIV' || compact === '1099DIV') return '1099-DIV'
  return raw.trim()
}

export function getFormDefinition(rawType: string): FormDefinition | undefined {
  return FORM_REGISTRY[normalizeFormType(rawType)]
}
