export type DocStatus = 'processing' | 'ready' | 'needs_review' | 'failed'
export type FieldType = 'currency' | 'ssn' | 'ein' | 'text'
export type ValidationMessage = { fieldKey: string; message: string }

export type FieldDef = { key: string; box: string; label: string; type: FieldType }

export type BBox = { page: number; x: number; y: number; w: number; h: number }

export type Field = {
  key: string
  label: string
  box: string
  value: string
  originalValue: string
  confidence: number
  type: FieldType
  bbox: BBox
  confirmed?: boolean
}

export type Document = {
  id: string
  filename: string
  fileUrl: string
  mimeType?: string
  formType: string
  status: DocStatus
  fields: Field[]
  reviewedAt: string | null
  validationMessages?: ValidationMessage[]
  error?: string
}

export type ExtractionResult = {
  fields: Field[]
  status: DocStatus
  detectedFormType: string
  validationMessages?: ValidationMessage[]
  error?: string
}
