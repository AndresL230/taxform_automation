import type { Document, ExtractionResult } from '../types'

export type DocumentBase = Pick<Document, 'id' | 'filename' | 'fileUrl' | 'reviewedAt'>

export function applyExtraction(base: DocumentBase, result: ExtractionResult): Document {
  const error =
    result.status === 'failed'
      ? result.error ?? `Detected ${result.detectedFormType}, not a legible W-2.`
      : result.error
  return {
    ...base,
    formType: 'W-2',
    status: result.status,
    fields: result.fields,
    ...(error ? { error } : {}),
  }
}
