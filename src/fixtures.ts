import type { Document, ExtractionResult } from './types'
import { applyExtraction, type DocumentBase } from './lib/applyExtraction'
import acmePdf from './assets/fixtures/acme.pdf'
import jdoePdf from './assets/fixtures/jdoe.pdf'
import scanPdf from './assets/fixtures/scan.pdf'
import contosoPdf from './assets/fixtures/contoso.pdf'
import smallcoPdf from './assets/fixtures/smallco.pdf'
import necPdf from './assets/fixtures/nec.pdf'
import intPdf from './assets/fixtures/int.pdf'
import divPdf from './assets/fixtures/div.pdf'
import acme from './fixtures/acme.json'
import jdoe from './fixtures/jdoe.json'
import scan from './fixtures/scan.json'
import contoso from './fixtures/contoso.json'
import smallco from './fixtures/smallco.json'
import nec from './fixtures/nec.json'
import int from './fixtures/int.json'
import div from './fixtures/div.json'

const asResult = (j: unknown): ExtractionResult => j as ExtractionResult
const PDF = 'application/pdf'

type Entry = { base: DocumentBase; result: ExtractionResult }

const entries: Entry[] = [
  { base: { id: 'doc-acme', filename: 'acme_w2_2024.pdf', fileUrl: acmePdf, mimeType: PDF, reviewedAt: '2026-02-11T15:02:00.000Z' }, result: asResult(acme) },
  { base: { id: 'doc-jdoe', filename: 'jdoe_w2_blurry.pdf', fileUrl: jdoePdf, mimeType: PDF, reviewedAt: null }, result: asResult(jdoe) },
  { base: { id: 'doc-scan', filename: 'scan_2231.pdf', fileUrl: scanPdf, mimeType: PDF, reviewedAt: null }, result: asResult(scan) },
  { base: { id: 'doc-contoso', filename: 'contoso_w2.pdf', fileUrl: contosoPdf, mimeType: PDF, reviewedAt: null }, result: asResult(contoso) },
  { base: { id: 'doc-smallco', filename: 'smallco_w2.pdf', fileUrl: smallcoPdf, mimeType: PDF, reviewedAt: '2026-03-04T09:20:00.000Z' }, result: asResult(smallco) },
  { base: { id: 'doc-nec', filename: 'globex_1099nec.pdf', fileUrl: necPdf, mimeType: PDF, reviewedAt: null }, result: asResult(nec) },
  { base: { id: 'doc-int', filename: 'firstnatl_1099int.pdf', fileUrl: intPdf, mimeType: PDF, reviewedAt: null }, result: asResult(int) },
  { base: { id: 'doc-div', filename: 'vanguard_1099div.pdf', fileUrl: divPdf, mimeType: PDF, reviewedAt: null }, result: asResult(div) },
]

export const fixtures: Document[] = entries.map((e) => applyExtraction(e.base, e.result))
