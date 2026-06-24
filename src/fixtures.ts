import type { Document, Field } from './types'
import w2Image from './assets/w2-sample.png'

// Percentages of the image (calibrated to the actual 1275×908 W-2 PNG).
const BBOX = {
  wages:          { page: 1, x: 54.0, y: 13.8, w: 18.5, h: 6.0 },
  fedWithholding: { page: 1, x: 72.5, y: 13.8, w: 22.0, h: 6.0 },
  ssWages:        { page: 1, x: 54.0, y: 19.8, w: 18.5, h: 6.0 },
  employerEIN:    { page: 1, x: 5.5,  y: 13.8, w: 48.5, h: 6.0 },
  employeeSSN:    { page: 1, x: 25.0, y: 8.5,  w: 21.0, h: 5.0 },
  employeeName:   { page: 1, x: 5.5,  y: 41.5, w: 48.5, h: 6.0 },
  employerName:   { page: 1, x: 5.5,  y: 19.3, w: 48.5, h: 16.0 },
} as const

function field(
  key: keyof typeof BBOX, label: string, box: string, value: string,
  type: Field['type'], confidence: number, originalValue?: string,
): Field {
  return { key, label, box, value, originalValue: originalValue ?? value, confidence, type, bbox: BBOX[key] }
}

export const W2_FIELD_TEMPLATE: Field[] = [
  field('wages', 'Wages, tips, other comp.', '1', '58,500.00', 'currency', 0.97),
  field('fedWithholding', 'Federal income tax withheld', '2', '7,920.00', 'currency', 0.96),
  field('ssWages', 'Social security wages', '3', '60,000.00', 'currency', 0.95),
  field('employerEIN', 'Employer EIN', 'b', '94-2719303', 'ein', 0.93),
  field('employeeSSN', 'Employee SSN', 'a', '532-19-7766', 'ssn', 0.94),
  field('employeeName', 'Employee name', 'e', 'Jordan A. Reyes', 'text', 0.9),
  field('employerName', 'Employer name', 'c', 'Northwind Logistics LLC', 'text', 0.91),
]

export const fixtures: Document[] = [
  {
    id: 'doc-acme', filename: 'acme_w2_2024.pdf', fileUrl: w2Image, formType: 'W-2',
    status: 'ready', reviewedAt: '2026-02-11T15:02:00.000Z',
    fields: [
      field('wages', 'Wages, tips, other comp.', '1', '82,300.00', 'currency', 0.99),
      field('fedWithholding', 'Federal income tax withheld', '2', '12,140.00', 'currency', 0.98),
      field('ssWages', 'Social security wages', '3', '84,000.00', 'currency', 0.97),
      field('employerEIN', 'Employer EIN', 'b', '38-1099210', 'ein', 0.96),
      field('employeeSSN', 'Employee SSN', 'a', '401-55-8123', 'ssn', 0.95),
      field('employeeName', 'Employee name', 'e', 'Acme Test Employee', 'text', 0.93),
      field('employerName', 'Employer name', 'c', 'Acme Corporation', 'text', 0.94),
    ],
  },
  {
    id: 'doc-jdoe', filename: 'jdoe_w2_blurry.jpg', fileUrl: w2Image, formType: 'W-2',
    status: 'needs_review', reviewedAt: null,
    fields: [
      field('wages', 'Wages, tips, other comp.', '1', '60,000.00', 'currency', 0.97),
      field('fedWithholding', 'Federal income tax withheld', '2', '8,400.00', 'currency', 0.92),
      field('ssWages', 'Social security wages', '3', '62,000.00', 'currency', 0.61), // low
      field('employerEIN', 'Employer EIN', 'b', '12-3456789', 'ein', 0.95, '12-3456780'), // edited
      field('employeeSSN', 'Employee SSN', 'a', '123-45-6789', 'ssn', 0.64), // low
      field('employeeName', 'Employee name', 'e', 'John Q. Doe', 'text', 0.89),
      field('employerName', 'Employer name', 'c', 'Contoso Freight Inc.', 'text', 0.9),
    ],
  },
  {
    id: 'doc-scan', filename: 'scan_2231.pdf', fileUrl: w2Image, formType: 'W-2',
    status: 'failed', reviewedAt: null, fields: [],
  },
  {
    id: 'doc-contoso', filename: 'contoso_w2.png', fileUrl: w2Image, formType: 'W-2',
    status: 'processing', reviewedAt: null, fields: [],
  },
  {
    id: 'doc-smallco', filename: 'smallco_w2.pdf', fileUrl: w2Image, formType: 'W-2',
    status: 'ready', reviewedAt: '2026-03-04T09:20:00.000Z',
    fields: [
      field('wages', 'Wages, tips, other comp.', '1', '44,750.00', 'currency', 0.96),
      field('fedWithholding', 'Federal income tax withheld', '2', '5,210.00', 'currency', 0.95),
      field('ssWages', 'Social security wages', '3', '45,000.00', 'currency', 0.94),
      field('employerEIN', 'Employer EIN', 'b', '77-0182234', 'ein', 0.92),
      field('employeeSSN', 'Employee SSN', 'a', '288-41-9930', 'ssn', 0.9),
      // employeeName + employerName omitted → partial extraction (5 of 7)
    ],
  },
]
