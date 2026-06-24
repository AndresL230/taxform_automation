# Tax Document Extraction Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the front end for a W-2 tax-document extraction tool — upload, a document table, and a review screen with editable fields and source highlighting — against mock data, scaffolded for single-Worker Cloudflare deployment.

**Architecture:** A React + TypeScript + Vite SPA with two routes (`/`, `/review/:id`). All state lives in one in-memory React context seeded from a fixtures file. Tailwind v4 supplies design tokens via `@theme`. A minimal Cloudflare Worker serves the built SPA from the `ASSETS` binding with SPA fallback, leaving a marked seam for future `/api/*` extraction routes.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`), React Router (declarative `BrowserRouter`), Vitest + React Testing Library, Wrangler.

## Global Constraints

- **Data model is a frozen contract** — `Document` / `Field` shapes from the spec must be used verbatim; do not add/rename/remove fields.
- **Accent discipline:** teal `#0F766E` appears in exactly three places — the single primary CTA per screen, the active/selected field row, the source-highlight box. Nowhere else. Teal CTAs use white text; teal is never a text color.
- **Most primary buttons are dark** (`#1F1F1F` bg, white text). "Mark as reviewed" is dark/ghost, never teal.
- **Radius:** `3px` everywhere (`rounded-[3px]`). **Spacing:** 8px scale. **Borders, not shadows.** Flat.
- **Typography:** Satoshi; tight headings (`tracking-[-0.01em]`); weight 500 default; sparing bold.
- **Dollar amounts and figures use `tabular-nums`.** Status/confidence indicators render as small squares.
- **Semantic colors are status-only and muted:** ready `#3f8f6b`, needs_review `#b88207`, failed `#c0453b`.
- **Never crash on partial data** — `fields` may be empty or shorter than 7; render what exists.
- **No API routes, no real extraction, no persistence** this phase.
- Package manager: **npm**.

---

## File Structure

```
package.json · vite.config.ts · tsconfig.json · tsconfig.node.json · wrangler.jsonc · index.html
src/
  worker.ts                 # CF Worker: ASSETS passthrough, /api/* seam
  main.tsx                  # React root + BrowserRouter + DocumentsProvider
  App.tsx                   # <Routes>
  index.css                 # @import fonts + tailwind + @theme tokens
  vite-env.d.ts
  test/setup.ts             # jest-dom
  types.ts                  # Document, Field (frozen contract)
  fixtures.ts               # 5 mock W-2 documents + hand-tuned bboxes
  state/DocumentsContext.tsx
  lib/format.ts             # confidenceTier, formatPercent, formatCurrency
  lib/export.ts             # toJSON, toCSV, downloadFile
  pages/Home.tsx · pages/Review.tsx
  components/
    StatusPill.tsx · FormTypeBadge.tsx · ConfidenceIndicator.tsx ·
    FieldRow.tsx · UploadZone.tsx · DocumentTable.tsx · DocumentViewer.tsx
  assets/
    w2-sample.(png|svg)
```

**Execution note (parallelism):** Tasks are grouped into phases. Within a phase, tasks touch disjoint files and may be dispatched to parallel subagents. Phase boundaries are sync points: do not start a phase until the previous one is reviewed and on `main`. Phases: **0** = Tasks 1–8 (foundation, partly sequential), **1** = Tasks 9–11, **2** = Tasks 12–15, **3** = Tasks 16–17, **4** = Task 18.

---

## PHASE 0 — Foundation

### Task 1: Project scaffold, Tailwind, test runner

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/test/setup.ts`
- Test: `src/test/setup.ts` + a smoke test `src/App.test.tsx`

**Interfaces:**
- Produces: a booting Vite React app; `npm run dev`, `npm run build`, `npm test` all work. `App` renders a placeholder for now.

- [ ] **Step 1: Initialize and install**

```bash
npm init -y
npm install react react-dom react-router-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react \
  @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Write `package.json` scripts**

Replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "cf-dev": "npm run build && wrangler dev",
  "deploy": "npm run build && wrangler deploy"
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 4: Write the two `tsconfig` files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Write `index.html`, `src/index.css`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/test/setup.ts`**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TaxExtract</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css` (full token set — Task 3 will not need to re-edit theme):

```css
@import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: 'Satoshi', system-ui, sans-serif;
  --color-paper: #FAFAF7;
  --color-paper-2: #F7F6F2;
  --color-ink: #1F1F1F;
  --color-accent: #0F766E;
  --color-border: #E7E5DF;
  --color-muted: #6B6A65;
  --color-ready: #3f8f6b;
  --color-ready-bg: #eaf4ee;
  --color-review: #b88207;
  --color-review-bg: #fbf2dc;
  --color-review-row: #fdf7e8;
  --color-review-line: #e6c97a;
  --color-failed: #c0453b;
  --color-failed-bg: #f8e7e5;
  --color-proc-bg: #eeeeee;
}

@layer base {
  body { @apply bg-paper text-ink font-sans antialiased; }
}
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom'
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx` (placeholder, replaced in Task 18):

```tsx
export default function App() {
  return <div className="p-6 text-ink">TaxExtract</div>
}
```

- [ ] **Step 6: Write the smoke test `src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('App renders the product name', () => {
  render(<App />)
  expect(screen.getByText('TaxExtract')).toBeInTheDocument()
})
```

- [ ] **Step 7: Verify test passes**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 8: Verify build works**

Run: `npm run build`
Expected: completes, creates `dist/` with no TS errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite+React+TS app with Tailwind v4 tokens and Vitest"
```

---

### Task 2: Cloudflare Worker + wrangler config

**Files:**
- Create: `src/worker.ts`, `wrangler.jsonc`

**Interfaces:**
- Produces: a Worker entry serving the SPA via `env.ASSETS`; `npm run cf-dev` serves the built app and client-side routes resolve.

- [ ] **Step 1: Write `src/worker.ts`**

```ts
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    // Future extraction routes attach here:
    // if (url.pathname.startsWith('/api/')) return handleApi(request, env)
    void url
    return env.ASSETS.fetch(request)
  },
}
```

- [ ] **Step 2: Write `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "taxform-automation",
  "main": "src/worker.ts",
  "compatibility_date": "2026-06-01",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

- [ ] **Step 3: Add wrangler dev dependency**

```bash
npm install -D wrangler
```

- [ ] **Step 4: Verify the Worker serves the built SPA**

Run: `npm run build && npx wrangler dev --port 8788` (start, then in another shell `curl -s http://localhost:8788/ | grep -o '<div id="root">'`, then stop with Ctrl-C)
Expected: `curl` returns `<div id="root">` (index.html served). A request to a client route like `/review/x` also returns index.html (SPA fallback).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Cloudflare Worker serving SPA via ASSETS binding"
```

---

### Task 3: W-2 placeholder image asset

**Files:**
- Create: `src/assets/w2-sample.png` **or** `src/assets/w2-sample.svg` (whichever ships)

**Interfaces:**
- Produces: a single importable W-2 image asset. Record its **rendered pixel dimensions** (needed by Task 7 for bbox tuning) in the commit message.

- [ ] **Step 1: Check for PDF→image tooling**

Run: `command -v pdftoppm; command -v magick || command -v convert`
- If `pdftoppm` is available, do Step 2a. Otherwise do Step 2b.

- [ ] **Step 2a: Acquire and crop the official IRS W-2 (preferred)**

```bash
curl -L 'https://www.irs.gov/pub/irs-pdf/fw2.pdf' -o /tmp/fw2.pdf
pdftoppm -png -r 150 -f 1 -l 1 /tmp/fw2.pdf /tmp/w2page
# /tmp/w2page-1.png is the full first page (multiple copies stacked).
# Crop to the top single W-2 copy (top ~46% of the page) with ImageMagick:
magick /tmp/w2page-1.png -gravity North -crop 100x46%+0+0 +repage src/assets/w2-sample.png
# (use `convert` instead of `magick` if only convert exists)
```
Open `src/assets/w2-sample.png` and confirm it shows one clean W-2 copy with readable boxes 1–6, a/b/c/e. Note its width×height.

- [ ] **Step 2b: Fallback — author a faithful W-2 SVG**

Create `src/assets/w2-sample.svg` (viewBox `0 0 800 520`, an authored recreation of the official W-2 grid). Use this content:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" font-family="Arial, sans-serif">
  <rect width="800" height="520" fill="#ffffff"/>
  <rect x="20" y="20" width="760" height="480" fill="none" stroke="#1F1F1F" stroke-width="2"/>
  <!-- left column: a / b / c / e -->
  <g stroke="#888" stroke-width="1" fill="none">
    <rect x="20" y="20" width="380" height="70"/>
    <rect x="20" y="90" width="380" height="70"/>
    <rect x="20" y="160" width="380" height="120"/>
    <rect x="20" y="280" width="380" height="70"/>
    <!-- right column: boxes 1-6 -->
    <rect x="400" y="20" width="190" height="70"/><rect x="590" y="20" width="190" height="70"/>
    <rect x="400" y="90" width="190" height="70"/><rect x="590" y="90" width="190" height="70"/>
    <rect x="400" y="160" width="190" height="70"/><rect x="590" y="160" width="190" height="70"/>
  </g>
  <g font-size="11" fill="#444">
    <text x="28" y="36">a  Employee's social security number</text>
    <text x="28" y="106">b  Employer identification number (EIN)</text>
    <text x="28" y="176">c  Employer's name, address, and ZIP code</text>
    <text x="28" y="296">e  Employee's name</text>
    <text x="408" y="36">1  Wages, tips, other compensation</text>
    <text x="598" y="36">2  Federal income tax withheld</text>
    <text x="408" y="106">3  Social security wages</text>
    <text x="598" y="106">4  Social security tax withheld</text>
    <text x="408" y="176">5  Medicare wages and tips</text>
    <text x="598" y="176">6  Medicare tax withheld</text>
  </g>
  <text x="400" y="510" text-anchor="middle" font-size="12" fill="#1F1F1F">Form W-2  Wage and Tax Statement</text>
</svg>
```

This SVG's viewBox is `800×520`; bbox percentages in Task 7 are measured against it. (If you shipped 2a instead, ignore these coordinates and measure against the PNG.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add W-2 placeholder image asset (record: <png|svg>, WxH)"
```

---

### Task 4: Data model types

**Files:**
- Create: `src/types.ts`

**Interfaces:**
- Produces: `Document`, `Field`, `DocStatus`, `FieldType`, `BBox` — imported by nearly every later task.

- [ ] **Step 1: Write `src/types.ts`**

```ts
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
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add frozen Document/Field data-model types"
```

---

### Task 5: `lib/format.ts` (TDD)

**Files:**
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `type ConfidenceTier = 'high' | 'medium' | 'low'`
  - `confidenceTier(confidence: number): ConfidenceTier` — `>= 0.85` → `high`; `< 0.7` → `low`; else `medium`.
  - `formatPercent(confidence: number): string` — e.g. `0.61` → `"61%"` (rounded).
  - `formatCurrency(value: string): string` — prefixes `"$"` if absent; passes through otherwise. e.g. `"60,000.00"` → `"$60,000.00"`.

- [ ] **Step 1: Write the failing test**

```ts
import { confidenceTier, formatPercent, formatCurrency } from './format'

test('confidenceTier buckets by threshold', () => {
  expect(confidenceTier(0.95)).toBe('high')
  expect(confidenceTier(0.85)).toBe('high')
  expect(confidenceTier(0.7)).toBe('medium')
  expect(confidenceTier(0.84)).toBe('medium')
  expect(confidenceTier(0.69)).toBe('low')
})

test('formatPercent rounds to whole percent', () => {
  expect(formatPercent(0.611)).toBe('61%')
  expect(formatPercent(1)).toBe('100%')
})

test('formatCurrency adds a single leading $', () => {
  expect(formatCurrency('60,000.00')).toBe('$60,000.00')
  expect(formatCurrency('$8,400.00')).toBe('$8,400.00')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- format`
Expected: FAIL (module/exports not found).

- [ ] **Step 3: Implement**

```ts
export type ConfidenceTier = 'high' | 'medium' | 'low'

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.85) return 'high'
  if (confidence < 0.7) return 'low'
  return 'medium'
}

export function formatPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

export function formatCurrency(value: string): string {
  return value.startsWith('$') ? value : `$${value}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add format helpers (confidence tiers, percent, currency)"
```

---

### Task 6: `lib/export.ts` (TDD)

**Files:**
- Create: `src/lib/export.ts`
- Test: `src/lib/export.test.ts`

**Interfaces:**
- Consumes: `Document` from `src/types.ts`.
- Produces:
  - `toJSON(doc: Document): string` — `JSON.stringify(doc, null, 2)`.
  - `toCSV(doc: Document): string` — header row `key,label,box,value,originalValue,confidence,type`, one row per field, RFC-4180 quoting (wrap a cell in quotes and double internal quotes when it contains `,`, `"`, or newline).
  - `downloadFile(filename: string, mime: string, content: string): void` — triggers a client-side download via a Blob + anchor click.

- [ ] **Step 1: Write the failing test**

```ts
import { toJSON, toCSV } from './export'
import type { Document } from '../types'

const doc: Document = {
  id: 'd1', filename: 'a.pdf', fileUrl: '/x.png', formType: 'W-2',
  status: 'ready', reviewedAt: null,
  fields: [
    { key: 'wages', label: 'Wages, tips, other comp.', box: '1', value: '60,000.00',
      originalValue: '60,000.00', confidence: 0.98, type: 'currency',
      bbox: { page: 1, x: 0, y: 0, w: 10, h: 5 } },
    { key: 'employer', label: 'Employer, Inc.', box: 'c', value: 'A, B Co',
      originalValue: 'A, B Co', confidence: 0.9, type: 'text',
      bbox: { page: 1, x: 0, y: 0, w: 10, h: 5 } },
  ],
}

test('toJSON round-trips the document', () => {
  expect(JSON.parse(toJSON(doc))).toEqual(doc)
})

test('toCSV emits header + a row per field and quotes commas', () => {
  const lines = toCSV(doc).split('\n')
  expect(lines[0]).toBe('key,label,box,value,originalValue,confidence,type')
  expect(lines[1]).toBe('wages,"Wages, tips, other comp.",1,"60,000.00","60,000.00",0.98,currency')
  expect(lines[2]).toBe('employer,"Employer, Inc.",c,"A, B Co","A, B Co",0.9,text')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- export`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Document } from '../types'

export function toJSON(doc: Document): string {
  return JSON.stringify(doc, null, 2)
}

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(doc: Document): string {
  const header = ['key', 'label', 'box', 'value', 'originalValue', 'confidence', 'type']
  const rows = doc.fields.map((f) =>
    [f.key, f.label, f.box, f.value, f.originalValue, f.confidence, f.type].map(csvCell).join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

export function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- export`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add JSON/CSV export + client-side download helper"
```

---

### Task 7: `fixtures.ts` — 5 mock documents + bboxes (TDD)

**Files:**
- Create: `src/fixtures.ts`
- Test: `src/fixtures.test.ts`

**Interfaces:**
- Consumes: `Document` from `types.ts`; the W-2 asset from Task 3.
- Produces: `export const fixtures: Document[]` (length 5) and `export const W2_FIELD_TEMPLATE: Field[]` (the 7-field template used by `addDocuments` in Task 8 for simulated extraction).

- [ ] **Step 1: Write the failing test (validates the spec's pinned data)**

```ts
import { fixtures, W2_FIELD_TEMPLATE } from './fixtures'

test('there are 5 documents covering every status', () => {
  expect(fixtures).toHaveLength(5)
  const statuses = fixtures.map((d) => d.status).sort()
  expect(statuses).toContain('ready')
  expect(statuses).toContain('needs_review')
  expect(statuses).toContain('failed')
  expect(statuses).toContain('processing')
})

test('the needs_review doc has exactly 2 low-confidence fields (<0.7)', () => {
  const nr = fixtures.find((d) => d.status === 'needs_review')!
  expect(nr.fields).toHaveLength(7)
  expect(nr.fields.filter((f) => f.confidence < 0.7)).toHaveLength(2)
  expect(nr.fields.some((f) => f.value !== f.originalValue)).toBe(true)
})

test('failed and processing docs have no fields; one ready doc is partial', () => {
  expect(fixtures.find((d) => d.status === 'failed')!.fields).toHaveLength(0)
  expect(fixtures.find((d) => d.status === 'processing')!.fields).toHaveLength(0)
  const readies = fixtures.filter((d) => d.status === 'ready')
  expect(readies.some((d) => d.fields.length === 5)).toBe(true)
})

test('every field has a bbox in 0–100% range', () => {
  for (const d of fixtures) {
    for (const f of d.fields) {
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(f.bbox[k]).toBeGreaterThanOrEqual(0)
        expect(f.bbox[k]).toBeLessThanOrEqual(100)
      }
    }
  }
})

test('the field template has all 7 W-2 fields', () => {
  expect(W2_FIELD_TEMPLATE.map((f) => f.key)).toEqual([
    'wages', 'fedWithholding', 'ssWages', 'employerEIN', 'employeeSSN',
    'employeeName', 'employerName',
  ])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- fixtures`
Expected: FAIL.

- [ ] **Step 3: Implement `src/fixtures.ts`**

Import the asset so Vite hashes it: `import w2Image from './assets/w2-sample.png'` (or `.svg` if Task 3 shipped the fallback). Define the 7-field template, then the 5 documents.

**bbox tuning:** the `bbox` values below are starting coordinates calibrated to the **800×520 SVG** from Task 3 Step 2b (as percentages). **If you shipped the cropped PNG (Step 2a) instead, open the image and adjust each `x/y/w/h` so the highlight lands on the right box** — this is a look-and-adjust step; verify in the running app during Task 15/17.

```ts
import type { Document, Field } from './types'
import w2Image from './assets/w2-sample.png' // change to ./assets/w2-sample.svg if SVG shipped

// Percentages of the image (calibrated to the 800x520 W-2 layout).
const BBOX = {
  wages:        { page: 1, x: 50.0, y: 3.8,  w: 23.75, h: 13.5 },
  fedWithholding:{ page: 1, x: 73.75, y: 3.8, w: 23.75, h: 13.5 },
  ssWages:      { page: 1, x: 50.0, y: 17.3, w: 23.75, h: 13.5 },
  employerEIN:  { page: 1, x: 2.5,  y: 17.3, w: 47.5, h: 13.5 },
  employeeSSN:  { page: 1, x: 2.5,  y: 3.8,  w: 47.5, h: 13.5 },
  employeeName: { page: 1, x: 2.5,  y: 53.8, w: 47.5, h: 13.5 },
  employerName: { page: 1, x: 2.5,  y: 30.8, w: 47.5, h: 23.0 },
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- fixtures`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add 5 mock W-2 fixtures with hand-tuned bboxes + field template"
```

---

### Task 8: `DocumentsContext` (TDD)

**Files:**
- Create: `src/state/DocumentsContext.tsx`
- Test: `src/state/DocumentsContext.test.tsx`

**Interfaces:**
- Consumes: `Document`/`Field` (types), `fixtures` + `W2_FIELD_TEMPLATE` (fixtures).
- Produces:
  - `DocumentsProvider({ children }: { children: React.ReactNode }): JSX.Element`
  - `useDocuments(): DocumentsContextValue` where
    ```ts
    type DocumentsContextValue = {
      documents: Document[]
      addDocuments(files: File[]): void
      updateField(docId: string, key: string, value: string): void
      markReviewed(docId: string): void
      getDocument(id: string): Document | undefined
    }
    ```
  - New uploads are appended as `processing` then, after ~1500ms, flip to a final status with `W2_FIELD_TEMPLATE` fields. `markReviewed` sets `status:'ready'` and `reviewedAt` to an ISO string.

- [ ] **Step 1: Write the failing test (uses fake timers for the upload flip)**

```tsx
import { act, render, screen } from '@testing-library/react'
import { DocumentsProvider, useDocuments } from './DocumentsContext'

function Harness() {
  const { documents, addDocuments, updateField, markReviewed } = useDocuments()
  return (
    <div>
      <span data-testid="count">{documents.length}</span>
      <span data-testid="first-status">{documents[0]?.status}</span>
      <button onClick={() => addDocuments([new File(['x'], 'new.pdf')])}>add</button>
      <button onClick={() => updateField('doc-jdoe', 'wages', '1.00')}>edit</button>
      <button onClick={() => markReviewed('doc-jdoe')}>review</button>
      <span data-testid="jdoe-wages">
        {documents.find((d) => d.id === 'doc-jdoe')?.fields.find((f) => f.key === 'wages')?.value}
      </span>
      <span data-testid="jdoe-status">
        {documents.find((d) => d.id === 'doc-jdoe')?.status}
      </span>
    </div>
  )
}

const setup = () => render(<DocumentsProvider><Harness /></DocumentsProvider>)

test('seeds from fixtures', () => {
  setup()
  expect(screen.getByTestId('count').textContent).toBe('5')
})

test('addDocuments appends processing then flips after timeout', () => {
  vi.useFakeTimers()
  setup()
  act(() => { screen.getByText('add').click() })
  expect(screen.getByTestId('count').textContent).toBe('6')
  act(() => { vi.advanceTimersByTime(2000) })
  // newest doc is no longer processing
  const statuses = screen.getAllByText(/processing|ready|needs_review|failed/)
  expect(statuses).toBeTruthy()
  vi.useRealTimers()
})

test('updateField changes a field value', () => {
  setup()
  act(() => { screen.getByText('edit').click() })
  expect(screen.getByTestId('jdoe-wages').textContent).toBe('1.00')
})

test('markReviewed flips status to ready', () => {
  setup()
  act(() => { screen.getByText('review').click() })
  expect(screen.getByTestId('jdoe-status').textContent).toBe('ready')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- DocumentsContext`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Document } from '../types'
import { fixtures, W2_FIELD_TEMPLATE } from '../fixtures'
import w2Image from '../assets/w2-sample.png' // match fixtures' asset

type DocumentsContextValue = {
  documents: Document[]
  addDocuments(files: File[]): void
  updateField(docId: string, key: string, value: string): void
  markReviewed(docId: string): void
  getDocument(id: string): Document | undefined
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null)

let seq = 0
const nextId = () => `doc-upload-${++seq}`

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = useState<Document[]>(fixtures)

  const addDocuments = useCallback((files: File[]) => {
    const created = files.map<Document>((file) => ({
      id: nextId(), filename: file.name, fileUrl: w2Image, formType: 'W-2',
      status: 'processing', reviewedAt: null, fields: [],
    }))
    setDocuments((prev) => [...created, ...prev])
    created.forEach((doc) => {
      setTimeout(() => {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, status: 'needs_review', fields: W2_FIELD_TEMPLATE.map((f) => ({ ...f })) }
              : d,
          ),
        )
      }, 1500)
    })
  }, [])

  const updateField = useCallback((docId: string, key: string, value: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, fields: d.fields.map((f) => (f.key === key ? { ...f, value } : f)) }
          : d,
      ),
    )
  }, [])

  const markReviewed = useCallback((docId: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, status: 'ready', reviewedAt: new Date().toISOString() } : d,
      ),
    )
  }, [])

  const getDocument = useCallback(
    (id: string) => documents.find((d) => d.id === id),
    [documents],
  )

  const value = useMemo(
    () => ({ documents, addDocuments, updateField, markReviewed, getDocument }),
    [documents, addDocuments, updateField, markReviewed, getDocument],
  )

  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext)
  if (!ctx) throw new Error('useDocuments must be used within DocumentsProvider')
  return ctx
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- DocumentsContext`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add in-memory DocumentsContext with upload/edit/review actions"
```

---

## PHASE 1 — Primitives (parallelizable: Tasks 9, 10, 11)

### Task 9: `StatusPill`

**Files:**
- Create: `src/components/StatusPill.tsx`
- Test: `src/components/StatusPill.test.tsx`

**Interfaces:**
- Consumes: `DocStatus` from `types.ts`.
- Produces: `StatusPill({ status }: { status: DocStatus }): JSX.Element`. Renders a label (`Ready` / `Needs review` / `Processing` / `Failed`) with a small square indicator. Colors per the muted semantic tokens.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import StatusPill from './StatusPill'

test.each([
  ['ready', 'Ready'],
  ['needs_review', 'Needs review'],
  ['processing', 'Processing'],
  ['failed', 'Failed'],
] as const)('renders %s label', (status, label) => {
  render(<StatusPill status={status} />)
  expect(screen.getByText(label)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- StatusPill`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import type { DocStatus } from '../types'

const META: Record<DocStatus, { label: string; text: string; bg: string; dot: string }> = {
  ready:        { label: 'Ready',        text: 'text-ready',  bg: 'bg-ready-bg',   dot: 'bg-ready' },
  needs_review: { label: 'Needs review', text: 'text-review', bg: 'bg-review-bg',  dot: 'bg-review' },
  processing:   { label: 'Processing',   text: 'text-muted', bg: 'bg-proc-bg',    dot: 'bg-muted' },
  failed:       { label: 'Failed',       text: 'text-failed', bg: 'bg-failed-bg', dot: 'bg-failed' },
}

export default function StatusPill({ status }: { status: DocStatus }) {
  const m = META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-0.5 text-xs font-semibold ${m.bg} ${m.text}`}>
      <span className={`h-2 w-2 rounded-[2px] ${m.dot}`} />
      {m.label}
    </span>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- StatusPill`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add StatusPill component"
```

---

### Task 10: `FormTypeBadge`

**Files:**
- Create: `src/components/FormTypeBadge.tsx`
- Test: `src/components/FormTypeBadge.test.tsx`

**Interfaces:**
- Produces: `FormTypeBadge({ formType }: { formType: string }): JSX.Element` — bordered neutral badge showing the form type.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import FormTypeBadge from './FormTypeBadge'

test('renders the form type', () => {
  render(<FormTypeBadge formType="W-2" />)
  expect(screen.getByText('W-2')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- FormTypeBadge`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
export default function FormTypeBadge({ formType }: { formType: string }) {
  return (
    <span className="inline-flex items-center rounded-[3px] border border-border bg-white px-2 py-0.5 text-xs font-semibold text-ink">
      {formType}
    </span>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- FormTypeBadge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add FormTypeBadge component"
```

---

### Task 11: `ConfidenceIndicator`

**Files:**
- Create: `src/components/ConfidenceIndicator.tsx`
- Test: `src/components/ConfidenceIndicator.test.tsx`

**Interfaces:**
- Consumes: `confidenceTier`, `formatPercent` from `lib/format`.
- Produces: `ConfidenceIndicator({ confidence }: { confidence: number }): JSX.Element`. `low` → amber square + `title` of exact %. `high`/`medium` → a faint neutral square placeholder (keeps row alignment) + `title` of exact %. The exact percentage appears only via the `title` attribute (hover).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import ConfidenceIndicator from './ConfidenceIndicator'

test('low confidence shows amber flag with exact % on hover only', () => {
  render(<ConfidenceIndicator confidence={0.61} />)
  const flag = screen.getByTitle('61%')
  expect(flag).toBeInTheDocument()
  expect(flag).toHaveAttribute('data-tier', 'low')
})

test('high confidence is not flagged as low', () => {
  render(<ConfidenceIndicator confidence={0.97} />)
  expect(screen.getByTitle('97%')).toHaveAttribute('data-tier', 'high')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- ConfidenceIndicator`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import { confidenceTier, formatPercent } from '../lib/format'

export default function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const tier = confidenceTier(confidence)
  const cls = tier === 'low' ? 'bg-review' : 'border border-border bg-transparent'
  return (
    <span
      data-tier={tier}
      title={formatPercent(confidence)}
      className={`inline-block h-2 w-2 rounded-[2px] ${cls}`}
    />
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- ConfidenceIndicator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add ConfidenceIndicator with tiered hover-only percent"
```

---

## PHASE 2 — Composites (parallelizable: Tasks 12, 13, 14, 15)

### Task 12: `FieldRow`

**Files:**
- Create: `src/components/FieldRow.tsx`
- Test: `src/components/FieldRow.test.tsx`

**Interfaces:**
- Consumes: `Field` (types); `ConfidenceIndicator`; `confidenceTier` (format).
- Produces:
  ```ts
  FieldRow({ field, selected, onSelect, onChange }: {
    field: Field
    selected: boolean
    onSelect: () => void
    onChange: (value: string) => void
  }): JSX.Element
  ```
  Renders label + box number, an editable input bound to `field.value`, and a `ConfidenceIndicator`. Clicking the row calls `onSelect`; typing calls `onChange`. When `field.value !== field.originalValue`, shows an "edited" marker. Low-confidence (`confidenceTier === 'low'`) rows get the faint amber tint + input border. Selected rows get the teal inset bar + faint teal tint.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FieldRow from './FieldRow'
import type { Field } from '../types'

const base: Field = {
  key: 'wages', label: 'Wages, tips, other comp.', box: '1', value: '60,000.00',
  originalValue: '60,000.00', confidence: 0.97, type: 'currency',
  bbox: { page: 1, x: 0, y: 0, w: 1, h: 1 },
}

test('shows label and box, fires onSelect on row click', async () => {
  const onSelect = vi.fn()
  render(<FieldRow field={base} selected={false} onSelect={onSelect} onChange={() => {}} />)
  expect(screen.getByText('Wages, tips, other comp.')).toBeInTheDocument()
  expect(screen.getByText(/Box 1/)).toBeInTheDocument()
  await userEvent.click(screen.getByText('Wages, tips, other comp.'))
  expect(onSelect).toHaveBeenCalled()
})

test('fires onChange when the input is edited', async () => {
  const onChange = vi.fn()
  render(<FieldRow field={base} selected={false} onSelect={() => {}} onChange={onChange} />)
  await userEvent.type(screen.getByDisplayValue('60,000.00'), '0')
  expect(onChange).toHaveBeenCalled()
})

test('shows edited marker when value differs from original', () => {
  render(<FieldRow field={{ ...base, value: '61,000.00' }} selected={false} onSelect={() => {}} onChange={() => {}} />)
  expect(screen.getByText(/edited/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- FieldRow`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import type { Field } from '../types'
import ConfidenceIndicator from './ConfidenceIndicator'
import { confidenceTier } from '../lib/format'

type Props = {
  field: Field
  selected: boolean
  onSelect: () => void
  onChange: (value: string) => void
}

export default function FieldRow({ field, selected, onSelect, onChange }: Props) {
  const low = confidenceTier(field.confidence) === 'low'
  const edited = field.value !== field.originalValue

  const rowCls = [
    'flex items-center gap-3 border-b border-border px-3.5 py-2.5 cursor-pointer',
    selected ? 'bg-accent/10 shadow-[inset_3px_0_0_var(--color-accent)]' : low ? 'bg-review-row' : 'bg-white',
  ].join(' ')

  return (
    <div className={rowCls} onClick={onSelect}>
      <div className="w-[150px] shrink-0">
        <div className="text-xs font-medium text-ink">
          {field.label}
          {edited && <span className="ml-1 text-[10px] italic text-muted">· edited</span>}
        </div>
        <div className="text-[10px] text-muted">Box {field.box}</div>
      </div>
      <input
        className={`flex-1 rounded-[3px] border bg-white px-2.5 py-1.5 text-xs tabular-nums text-ink outline-none focus:border-accent ${low ? 'border-review-line' : 'border-border'}`}
        value={field.value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
      />
      <ConfidenceIndicator confidence={field.confidence} />
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- FieldRow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add FieldRow with edit, confidence tint, selection states"
```

---

### Task 13: `DocumentTable`

**Files:**
- Create: `src/components/DocumentTable.tsx`
- Test: `src/components/DocumentTable.test.tsx`

**Interfaces:**
- Consumes: `Document` (types); `StatusPill`; `FormTypeBadge`; `Link` from `react-router-dom`.
- Produces: `DocumentTable({ documents }: { documents: Document[] }): JSX.Element`. Columns: Filename, Form, Status, Action. Non-`processing` rows link to `/review/:id`; `processing` rows show a disabled, non-link action.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DocumentTable from './DocumentTable'
import type { Document } from '../types'

const docs: Document[] = [
  { id: 'd1', filename: 'ready.pdf', fileUrl: '', formType: 'W-2', status: 'ready', reviewedAt: null, fields: [] },
  { id: 'd2', filename: 'busy.pdf', fileUrl: '', formType: 'W-2', status: 'processing', reviewedAt: null, fields: [] },
]

test('renders a row per document with a review link for ready docs', () => {
  render(<MemoryRouter><DocumentTable documents={docs} /></MemoryRouter>)
  expect(screen.getByText('ready.pdf')).toBeInTheDocument()
  const link = screen.getByRole('link', { name: /review/i })
  expect(link).toHaveAttribute('href', '/review/d1')
})

test('processing rows do not have a review link', () => {
  render(<MemoryRouter><DocumentTable documents={docs} /></MemoryRouter>)
  const row = screen.getByText('busy.pdf').closest('tr')!
  expect(within(row).queryByRole('link')).toBeNull()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- DocumentTable`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import { Link } from 'react-router-dom'
import type { Document } from '../types'
import StatusPill from './StatusPill'
import FormTypeBadge from './FormTypeBadge'

const TH = 'px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted'
const TD = 'px-3.5 py-3 border-t border-border align-middle'

export default function DocumentTable({ documents }: { documents: Document[] }) {
  return (
    <table className="w-full border-collapse rounded-[3px] border border-border bg-white text-sm">
      <thead className="bg-paper-2">
        <tr>
          <th className={TH}>Filename</th>
          <th className={TH}>Form</th>
          <th className={TH}>Status</th>
          <th className={`${TH} text-right`}>Action</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((d) => (
          <tr key={d.id}>
            <td className={`${TD} font-medium`}>{d.filename}</td>
            <td className={TD}><FormTypeBadge formType={d.formType} /></td>
            <td className={TD}><StatusPill status={d.status} /></td>
            <td className={`${TD} text-right`}>
              {d.status === 'processing' ? (
                <span className="text-muted/50">Review →</span>
              ) : (
                <Link to={`/review/${d.id}`} className="font-semibold text-ink underline underline-offset-2">
                  Review →
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- DocumentTable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add DocumentTable with status-aware review links"
```

---

### Task 14: `UploadZone`

**Files:**
- Create: `src/components/UploadZone.tsx`
- Test: `src/components/UploadZone.test.tsx`

**Interfaces:**
- Produces: `UploadZone({ onFiles }: { onFiles: (files: File[]) => void }): JSX.Element`. Click opens a hidden multi-file input (accept `.pdf,.png,.jpg,.jpeg`); drag-drop calls `onFiles` with dropped files. The visible "Browse files" button is the screen's single teal CTA.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadZone from './UploadZone'

test('selecting files via the input calls onFiles', async () => {
  const onFiles = vi.fn()
  const { container } = render(<UploadZone onFiles={onFiles} />)
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, new File(['x'], 'a.pdf', { type: 'application/pdf' }))
  expect(onFiles).toHaveBeenCalledTimes(1)
  expect(onFiles.mock.calls[0][0][0].name).toBe('a.pdf')
})

test('dropping files calls onFiles', () => {
  const onFiles = vi.fn()
  render(<UploadZone onFiles={onFiles} />)
  const zone = screen.getByText(/drag/i).closest('div')!
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } })
  expect(onFiles).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- UploadZone`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import { useRef, useState } from 'react'

export default function UploadZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const emit = (list: FileList | null) => {
    if (list && list.length) onFiles(Array.from(list))
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); emit(e.dataTransfer.files) }}
      className={`rounded-[3px] border-2 border-dashed bg-paper-2 p-10 text-center ${dragOver ? 'border-accent' : 'border-[#d7d4cc]'}`}
    >
      <div className="text-2xl">⬆</div>
      <div className="mt-2 text-base font-semibold text-ink">Drag &amp; drop tax documents</div>
      <div className="text-sm text-muted">PDF, PNG or JPG · multiple files · or click to browse</div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-4 rounded-[3px] bg-accent px-4 py-2 text-sm font-semibold text-white"
      >
        Browse files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => emit(e.target.files)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- UploadZone`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add UploadZone with click + drag-drop multi-file input"
```

---

### Task 15: `DocumentViewer`

**Files:**
- Create: `src/components/DocumentViewer.tsx`
- Test: `src/components/DocumentViewer.test.tsx`

**Interfaces:**
- Consumes: `BBox` (types).
- Produces: `DocumentViewer({ fileUrl, highlight }: { fileUrl: string; highlight: BBox | null }): JSX.Element`. Renders the image; when `highlight` is non-null, overlays a teal rectangle positioned with `left/top/width/height` as `%` from the bbox. No overlay when `highlight` is null.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import DocumentViewer from './DocumentViewer'

test('renders the image and no overlay when highlight is null', () => {
  render(<DocumentViewer fileUrl="/w2.png" highlight={null} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', '/w2.png')
  expect(screen.queryByTestId('bbox-highlight')).toBeNull()
})

test('positions the overlay from the bbox percentages', () => {
  render(<DocumentViewer fileUrl="/w2.png" highlight={{ page: 1, x: 50, y: 10, w: 24, h: 13 }} />)
  const box = screen.getByTestId('bbox-highlight')
  expect(box).toHaveStyle({ left: '50%', top: '10%', width: '24%', height: '13%' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- DocumentViewer`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import type { BBox } from '../types'

export default function DocumentViewer({ fileUrl, highlight }: { fileUrl: string; highlight: BBox | null }) {
  return (
    <div className="relative">
      <img src={fileUrl} alt="Tax document" className="block w-full" />
      {highlight && (
        <div
          data-testid="bbox-highlight"
          className="pointer-events-none absolute rounded-[3px] border-2 border-accent bg-accent/20"
          style={{
            left: `${highlight.x}%`,
            top: `${highlight.y}%`,
            width: `${highlight.w}%`,
            height: `${highlight.h}%`,
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- DocumentViewer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add DocumentViewer with percentage-positioned bbox overlay"
```

---

## PHASE 3 — Pages (parallelizable: Tasks 16, 17)

### Task 16: `Home` page

**Files:**
- Create: `src/pages/Home.tsx`
- Test: `src/pages/Home.test.tsx`

**Interfaces:**
- Consumes: `useDocuments`; `UploadZone`; `DocumentTable`.
- Produces: `Home(): JSX.Element`. Renders a top bar, the `UploadZone` (wired to `addDocuments`), and the `DocumentTable`. **Empty state:** when `documents.length === 0`, render only the centered upload zone (no table).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'
import { DocumentsProvider } from '../state/DocumentsContext'

const renderHome = () =>
  render(<MemoryRouter><DocumentsProvider><Home /></DocumentsProvider></MemoryRouter>)

test('shows the upload zone and the seeded documents table', () => {
  renderHome()
  expect(screen.getByText(/drag/i)).toBeInTheDocument()
  expect(screen.getByText('acme_w2_2024.pdf')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- pages/Home`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import { useDocuments } from '../state/DocumentsContext'
import UploadZone from '../components/UploadZone'
import DocumentTable from '../components/DocumentTable'

export default function Home() {
  const { documents, addDocuments } = useDocuments()
  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center gap-2.5 border-b border-border bg-white px-4 py-3 text-sm font-semibold">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
        TaxExtract
        <span className="ml-auto text-xs font-medium text-muted">Tax preparer</span>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <UploadZone onFiles={addDocuments} />
        {documents.length > 0 && (
          <div className="mt-6">
            <DocumentTable documents={documents} />
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- pages/Home`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Home page with upload zone and document table"
```

---

### Task 17: `Review` page

**Files:**
- Create: `src/pages/Review.tsx`
- Test: `src/pages/Review.test.tsx`

**Interfaces:**
- Consumes: `useDocuments`; `useParams`, `Link` (react-router-dom); `DocumentViewer`; `FieldRow`; `StatusPill`; `FormTypeBadge`; `toJSON`, `toCSV`, `downloadFile` (lib/export).
- Produces: `Review(): JSX.Element`. Reads `:id`. Unknown id → "Document not found" + back link. Header: back, filename, badge, status pill, "Mark as reviewed" (dark/ghost), "Export ▾" (teal CTA → JSON/CSV via `downloadFile`). Split pane: left `DocumentViewer` (highlight = selected field's bbox), right scrollable `FieldRow` list. Selecting a row sets the highlight; editing calls `updateField`; "Mark as reviewed" calls `markReviewed`. Render only the fields present (handles partial/empty).

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Review from './Review'
import { DocumentsProvider } from '../state/DocumentsContext'

const renderAt = (path: string) =>
  render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/review/:id" element={<Review />} />
        </Routes>
      </MemoryRouter>
    </DocumentsProvider>,
  )

test('unknown id shows not-found', () => {
  renderAt('/review/nope')
  expect(screen.getByText(/not found/i)).toBeInTheDocument()
})

test('renders fields and highlights the clicked field', async () => {
  renderAt('/review/doc-jdoe')
  expect(screen.getByText('jdoe_w2_blurry.jpg')).toBeInTheDocument()
  expect(screen.queryByTestId('bbox-highlight')).toBeNull()
  await userEvent.click(screen.getByText('Wages, tips, other comp.'))
  expect(screen.getByTestId('bbox-highlight')).toBeInTheDocument()
})

test('mark as reviewed flips the status pill to Ready', async () => {
  renderAt('/review/doc-jdoe')
  await userEvent.click(screen.getByRole('button', { name: /mark as reviewed/i }))
  expect(screen.getByText('Ready')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- pages/Review`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDocuments } from '../state/DocumentsContext'
import DocumentViewer from '../components/DocumentViewer'
import FieldRow from '../components/FieldRow'
import StatusPill from '../components/StatusPill'
import FormTypeBadge from '../components/FormTypeBadge'
import { toJSON, toCSV, downloadFile } from '../lib/export'
import type { BBox } from '../types'

export default function Review() {
  const { id } = useParams()
  const { getDocument, updateField, markReviewed } = useDocuments()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const doc = id ? getDocument(id) : undefined

  if (!doc) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-ink">Document not found.</p>
        <Link to="/" className="mt-2 inline-block font-semibold text-ink underline underline-offset-2">← Back</Link>
      </div>
    )
  }

  const selectedField = doc.fields.find((f) => f.key === selectedKey) ?? null
  const highlight: BBox | null = selectedField ? selectedField.bbox : null
  const baseName = doc.filename.replace(/\.[^.]+$/, '')

  return (
    <div className="min-h-screen bg-paper">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border bg-white px-4 py-3">
        <Link to="/" className="rounded-[3px] border border-border bg-white px-2.5 py-1.5 text-sm">←</Link>
        <span className="text-sm font-semibold">{doc.filename}</span>
        <FormTypeBadge formType={doc.formType} />
        <StatusPill status={doc.status} />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => markReviewed(doc.id)}
            className="rounded-[3px] border border-border bg-white px-3.5 py-2 text-sm font-semibold text-ink"
          >
            Mark as reviewed
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-[3px] bg-accent px-3.5 py-2 text-sm font-semibold text-white"
            >
              Export ▾
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-32 rounded-[3px] border border-border bg-white py-1 shadow-sm">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-2"
                  onClick={() => { downloadFile(`${baseName}.json`, 'application/json', toJSON(doc)); setMenuOpen(false) }}
                >
                  JSON
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-2"
                  onClick={() => { downloadFile(`${baseName}.csv`, 'text/csv', toCSV(doc)); setMenuOpen(false) }}
                >
                  CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {doc.status === 'processing' ? (
          <p className="text-muted">This document is still processing…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="overflow-hidden rounded-[3px] border border-border bg-white">
              <div className="border-b border-border bg-paper-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Document</div>
              <div className="p-3.5">
                <DocumentViewer fileUrl={doc.fileUrl} highlight={highlight} />
              </div>
            </section>
            <section className="overflow-hidden rounded-[3px] border border-border bg-white">
              <div className="border-b border-border bg-paper-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Fields · {doc.fields.length} extracted
              </div>
              {doc.fields.length === 0 ? (
                <p className="px-3.5 py-6 text-sm text-muted">No fields were extracted from this document.</p>
              ) : (
                doc.fields.map((f) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    selected={selectedKey === f.key}
                    onSelect={() => setSelectedKey(f.key)}
                    onChange={(value) => updateField(doc.id, f.key, value)}
                  />
                ))
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- pages/Review`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Review page with viewer, editable fields, export"
```

---

## PHASE 4 — Integration & verification

### Task 18: Wire routes and full-stack smoke test

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/App.test.tsx` (replace the placeholder smoke test)

**Interfaces:**
- Consumes: `Home`, `Review` pages; `DocumentsProvider`; `BrowserRouter`, `Routes`, `Route`.
- Produces: a fully wired SPA.

- [ ] **Step 1: Update the smoke test to assert routing**

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { DocumentsProvider } from './state/DocumentsContext'
import Home from './pages/Home'

test('Home route renders the upload zone', () => {
  render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="/" element={<Home />} /></Routes>
      </MemoryRouter>
    </DocumentsProvider>,
  )
  expect(screen.getByText(/drag/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Write `src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Review from './pages/Review'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/review/:id" element={<Review />} />
    </Routes>
  )
}
```

- [ ] **Step 3: Update `src/main.tsx` to provide router + context**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { DocumentsProvider } from './state/DocumentsContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DocumentsProvider>
        <App />
      </DocumentsProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Typecheck + production build**

Run: `npm run build`
Expected: no TS errors; `dist/` produced.

- [ ] **Step 6: Manual smoke test in the dev server**

Run: `npm run dev`, open the URL. Verify: empty-vs-populated home, upload (processing → flips after ~1.5s), navigate to a review, click rows to move the highlight, edit a value (see "edited"), low-confidence amber rows on `jdoe`, Mark as reviewed flips to Ready, Export downloads JSON and CSV. Confirm the `failed` doc opens read-only and the partial `smallco` doc renders 5 fields without crashing. **If any bbox highlight is misaligned, adjust the `BBOX` percentages in `fixtures.ts` now.**

- [ ] **Step 7: Cloudflare Worker smoke test**

Run: `npm run cf-dev` (builds then serves). Visit `/` and a deep link like `/review/doc-acme` (hard refresh) — both should load (SPA fallback). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wire BrowserRouter routes and provider; integration verified"
```

---

## Self-Review (completed)

- **Spec coverage:** Stack/deploy → Tasks 1–2; tokens/fonts → Task 1 (`index.css`); W-2 image → Task 3; data model → Task 4; format/export helpers → Tasks 5–6; 5 fixtures w/ pinned data → Task 7; state actions → Task 8; primitives → 9–11; composites → 12–15; Home (+empty state) → 16; Review (+not-found, partial, processing) → 17; routing/SPA fallback verified → 18. All cross-cutting states covered.
- **Placeholder scan:** none — every step has concrete code/commands. The one look-and-adjust step (bbox tuning) is inherent to image work and bounded with starter values + a verification step.
- **Type consistency:** `DocumentsContextValue`, `FieldRow` props, `DocumentViewer` props, `confidenceTier`, `toJSON/toCSV/downloadFile` signatures are consistent across producing and consuming tasks. Asset import path (`w2-sample.png` vs `.svg`) must match in `fixtures.ts` and `DocumentsContext.tsx` — flagged in both tasks.
