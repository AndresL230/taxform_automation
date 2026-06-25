import type { Document, ExtractionResult } from './types'
import { applyExtraction, type DocumentBase } from './lib/applyExtraction'
import w2Image from './assets/w2-sample.png'
import acme from './fixtures/acme.json'
import jdoe from './fixtures/jdoe.json'
import scan from './fixtures/scan.json'
import contoso from './fixtures/contoso.json'
import smallco from './fixtures/smallco.json'
import nec from './fixtures/nec.json'

const asResult = (j: unknown): ExtractionResult => j as ExtractionResult

type Entry = { base: DocumentBase; result: ExtractionResult }

const entries: Entry[] = [
  { base: { id: 'doc-acme', filename: 'acme_w2_2024.pdf', fileUrl: w2Image, reviewedAt: '2026-02-11T15:02:00.000Z' }, result: asResult(acme) },
  { base: { id: 'doc-jdoe', filename: 'jdoe_w2_blurry.jpg', fileUrl: w2Image, reviewedAt: null }, result: asResult(jdoe) },
  { base: { id: 'doc-scan', filename: 'scan_2231.pdf', fileUrl: w2Image, reviewedAt: null }, result: asResult(scan) },
  { base: { id: 'doc-contoso', filename: 'contoso_w2.png', fileUrl: w2Image, reviewedAt: null }, result: asResult(contoso) },
  { base: { id: 'doc-smallco', filename: 'smallco_w2.pdf', fileUrl: w2Image, reviewedAt: '2026-03-04T09:20:00.000Z' }, result: asResult(smallco) },
  { base: { id: 'doc-nec', filename: 'globex_1099nec.pdf', fileUrl: w2Image, reviewedAt: null }, result: asResult(nec) },
]

export const fixtures: Document[] = entries.map((e) => applyExtraction(e.base, e.result))
