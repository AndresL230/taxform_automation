import type { FieldType } from '../../src/types'

// Ground truth for one scored field.
export type FieldGT = {
  key: string
  box: string
  type: FieldType
  printed: string // exactly what is rendered on the form ("" if the box is blank)
  expected: string // the normalized value the extractor SHOULD return
  expectEmpty: boolean // true => correct behavior is an empty value (anti-hallucination)
}

// All scored fields for one variant, in field order.
export type GroundTruth = {
  scenario: string
  fields: Record<string, FieldGT>
}

// Everything written into the PDF for a render scenario. Superset of scored fields.
export type FormData = {
  wages: string
  federalWithholding: string
  socialSecurityWages: string
  employerEIN: string
  employeeSSN: string
  employeeName: string
  employerName: string
  // supporting fields for realism, not scored
  employeeAddress: string
  employerAddress: string
  controlNumber: string
  socialSecurityTaxWithheld: string
  medicareWages: string
  medicareTaxWithheld: string
  stateCode: string
  stateWages: string
  stateTax: string
}

// Pixel rectangle of a field's value on the rendered clean PNG (for redaction).
export type LayoutRect = { x: number; y: number; w: number; h: number }
export type Layout = Record<string, LayoutRect>

// One row to score: an image plus its ground truth.
export type VariantManifestEntry = {
  variant: string
  image: string // filename in out/
  mime: 'image/png' | 'image/jpeg'
  groundtruth: string // filename in out/
}
