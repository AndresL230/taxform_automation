import type { Document, ExtractionResult } from '../types'

export type DocumentBase = Pick<Document, 'id' | 'filename' | 'fileUrl' | 'mimeType' | 'reviewedAt'>

export function applyExtraction(base: DocumentBase, result: ExtractionResult): Document {
  return {
    ...base,
    formType: result.detectedFormType,
    status: result.status,
    fields: result.fields,
    ...(result.error ? { error: result.error } : {}),
  }
}
