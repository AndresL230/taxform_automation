export type DocStatus = 'processing' | 'ready' | 'needs_review' | 'failed'
export type FieldType = 'currency' | 'ssn' | 'ein' | 'text'

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
}

export type Document = {
  id: string
  filename: string
  fileUrl: string
  formType: 'W-2'
  status: DocStatus
  fields: Field[]
  reviewedAt: string | null
}
