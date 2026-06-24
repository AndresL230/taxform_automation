# Tax Document Extraction — Frontend Design Spec

**Date:** 2026-06-24
**Status:** Approved (design direction)
**Scope:** Front end only, mock data. No real extraction, no API routes. Scaffolded for Cloudflare Workers static-asset deployment.

## 1. Purpose

A tool for a **tax preparer** who uploads tax documents (W-2s), reviews the data an
extraction layer pulled out, corrects low-confidence fields, and exports the verified
data to tax software. This phase builds the **UI only**, against hardcoded mock data.
A later phase adds `/api/*` extraction routes to the same Cloudflare Worker.

## 2. Stack & Deployment

- **React 18 + TypeScript + Vite**
- **Tailwind CSS v4** (CSS-first config via `@theme` in `index.css`)
- **React Router** (declarative `BrowserRouter`), two routes: `/` and `/review/:id`
- **Satoshi** typeface, **self-hosted** (`@font-face`, woff2 in `src/assets/fonts/`).
  Satoshi is free for web embedding via Fontshare. Fallback: Fontshare CDN `<link>`
  in `index.html` if the woff2 download is unavailable at build time; final fallback
  `system-ui, sans-serif`.
- **Package manager:** npm.
- **Deployment:** a single Cloudflare Worker that serves the built SPA as static assets.
  - `wrangler.jsonc` with:
    - `main: "src/worker.ts"` — minimal Worker entry, ready to gain `/api/*` later.
    - `assets`: `directory: "./dist"`, `binding: "ASSETS"`,
      `not_found_handling: "single-page-application"` (client-side routing).
  - `src/worker.ts` exports a `fetch` handler that delegates to `env.ASSETS.fetch(request)`.
    A commented `// if (url.pathname.startsWith('/api/')) ...` branch marks where
    extraction routes attach later. **No API routes built now.**
  - `wrangler dev` and `wrangler deploy` must both work.
- **State:** all in memory. Mock data hardcoded in `src/fixtures.ts`. No persistence.

## 3. Data Model (exact contract — do not deviate)

This is the shape the extraction layer will return later. Defined in `src/types.ts`.

```ts
type Document = {
  id: string
  filename: string
  fileUrl: string            // mock: a placeholder W-2 form image
  formType: 'W-2'
  status: 'processing' | 'ready' | 'needs_review' | 'failed'
  fields: Field[]
  reviewedAt: string | null
}

type Field = {
  key: string                // 'wages'
  label: string              // 'Wages, tips, other comp.'
  box: string                // '1'
  value: string              // editable, current truth
  originalValue: string      // extraction's original output
  confidence: number         // 0–1
  type: 'currency' | 'ssn' | 'ein' | 'text'
  bbox: { page: number, x: number, y: number, w: number, h: number } // % of image
}
```

## 4. Design Language

Modeled on the Ramp product dashboard, retuned to a **cool teal accent** on a
**warm-neutral** base. Calm, dense, premium financial instrument. Borders over
shadows, flat.

### Tokens (defined once in `@theme`, consumed as Tailwind utilities)

| Token | Value | Use |
|---|---|---|
| `--color-paper` | `#FAFAF7` | app background |
| `--color-paper-2` | `#F7F6F2` | secondary surfaces (table headers, panel headers, upload zone) |
| `--color-ink` | `#1F1F1F` | primary text, dark buttons, high-emphasis UI |
| `--color-accent` | `#0F766E` | **teal** — see accent discipline below |
| `--color-border` | `#E7E5DF` | warm gray borders |
| `--color-muted` | `#6B6A65` | warm gray secondary text |
| `--color-ready` | `#3f8f6b` | status: ready/verified (muted emerald) |
| `--color-review` | `#b88207` | status: needs review (muted amber) |
| `--color-failed` | `#c0453b` | status: failed (muted red) |

Derived tints (used inline / as utility values):
- Accent highlight fill: `rgba(15,118,110,.22)` with a `1px` ink-tinted outline.
- Selected row: `rgba(15,118,110,.10)` background + `inset 3px 0 0 var(--color-accent)` bar.
- Ready pill bg `#eaf4ee`; review pill bg `#fbf2dc`; failed pill bg `#f8e7e5`;
  processing pill bg `#eeeeee`.
- Low-confidence row tint `#fdf7e8`; low-confidence input border `#e6c97a`.

### Rules

- **Accent discipline — teal `#0F766E` appears in exactly three places, never more:**
  1. the **single primary CTA per screen** (Home: "Browse files"; Review: "Export"),
  2. the **active/selected field row** on Review,
  3. the **source-highlight box** on the Review document viewer.
  Teal CTAs use **white** text. Teal is never used as a text color elsewhere.
- **Most "primary" buttons are dark** (`#1F1F1F` bg, white text). The secondary action
  on Review ("Mark as reviewed") is dark or ghost — never teal.
- **Semantic colors are status-only** and kept muted so they sit calmly beside the teal.
- **Radius: 3px** everywhere (subtle softening — crisp, not hard, not rounded).
- **Spacing: 8px scale.** Borders, not shadows. Flat.
- **Typography:** Satoshi. Confident, slightly tight headings (`letter-spacing: -.01em`),
  medium weight (500) as the default, bold used sparingly.
- **Dollar amounts and figures use `tabular-nums`** so columns align.
- Status/confidence indicators render as **small squares** (not dots), matching the
  squared-but-softened aesthetic.

## 5. Mock Data (`src/fixtures.ts`)

- All documents share **one placeholder W-2 image** for `fileUrl`: the **official IRS
  Form W-2**.
  - Build step: download the official `fw2.pdf` from irs.gov and convert one copy to a
    PNG bundled at `src/assets/w2-sample.png`. **Fallback** (if `pdftoppm`/ImageMagick
    is unavailable): a faithful, pixel-controlled SVG recreation of the official W-2
    layout at `src/assets/w2-sample.svg`. Either way it is a single fixed raster/vector
    asset, and the implementer records which one shipped.
- **Full field set** (7), in this order: wages (box 1), federal withholding (box 2),
  social security wages (box 3), employer EIN, employee SSN, employee name,
  employer name. Fake but plausible values.
- **`bbox` values are hand-tuned** against the chosen W-2 image so each field's
  highlight lands on the correct region (visibly correct in the demo).

**The 5 documents (explicit):**

1. **`ready`** — "acme_w2_2024.pdf", all 7 fields, all `confidence >= 0.85`,
   `reviewedAt` set. Every `value === originalValue`.
2. **`needs_review`** — "jdoe_w2_blurry.jpg", all 7 fields, **exactly 2 fields with
   `confidence < 0.7`** (social security wages and employee SSN). One field
   (employer EIN) has `value !== originalValue` to show the "edited" marker on load.
   `reviewedAt: null`.
3. **`failed`** — "scan_2231.pdf", `fields: []` (extraction failed), `reviewedAt: null`.
4. **`processing`** — "contoso_w2.png", `fields: []`, `reviewedAt: null`. Seeded as a
   **static** processing row so that state is always visible in the demo; it does not
   auto-flip. (Live processing→final transitions come from new uploads.)
5. **`ready` (partial)** — "smallco_w2.pdf", only **5 of 7 fields** present (employer
   name and employee name omitted) to demonstrate partial-extraction resilience.
   Present fields all `confidence >= 0.85`. `reviewedAt` set.

## 6. State (`src/state/DocumentsContext.tsx`)

A single in-memory React context is the source of truth for both screens.

- **State:** `documents: Document[]`, seeded from `fixtures.ts`.
- **Actions:**
  - `addDocuments(files: File[])` — append each as a new `Document` with
    `status: 'processing'`, `fields: []`, `reviewedAt: null`, `fileUrl` = the placeholder
    image. Then, per document, a `setTimeout` flips `status` to a final value and
    populates `fields` from a mock template (simulated extraction). No real processing.
  - `updateField(docId, key, value)` — set that field's `value`.
  - `markReviewed(docId)` — set `status: 'ready'` and `reviewedAt = new Date().toISOString()`.
  - `getDocument(id)` — selector returning `Document | undefined`.
- Exposed via a `useDocuments()` hook. Provider wraps the router in `main.tsx`.

## 7. Screens

### Screen A — Home (`/`) — `src/pages/Home.tsx`

- **Upload zone** at top: large drag-and-drop + click-to-browse, accepts PDF/PNG/JPG,
  multi-file. "Browse files" is the screen's single teal CTA. On upload, calls
  `addDocuments` (processing → final status via timeout).
- **Document table** below: columns **Filename**, **Form** (`FormTypeBadge`),
  **Status** (`StatusPill`), **Action** (a "Review →" link to `/review/:id`).
  - `processing` rows show a disabled/non-link Review action.
- **Empty state:** no documents → only the centered upload zone, no table.

### Screen B — Review (`/review/:id`) — `src/pages/Review.tsx`

- **Header:** back button, filename, `FormTypeBadge`, current `StatusPill`,
  "Mark as reviewed" button (dark/ghost), "Export" button (teal CTA) with a dropdown
  (**JSON / CSV**) wired to **real client-side download** built from current state.
- **Split pane:**
  - **LEFT — `DocumentViewer`:** the `fileUrl` rendered as an `<img>` with a highlight
    rectangle positioned from the selected field's `bbox` (% coords over the image),
    drawn in teal. No highlight when no field is selected or the field lacks a bbox.
  - **RIGHT — scrollable list of `FieldRow`** (one per `doc.fields`, in order).
- **`FieldRow`:** label + box number, an editable `<input>` bound to `value`, and a
  `ConfidenceIndicator`. Tiers, not raw numbers:
  - `>= 0.85` → no flag.
  - `< 0.7` → amber square indicator **and** faint amber row tint (`#fdf7e8`).
  - `0.7–0.85` → neutral (no flag, no tint).
  - Exact `%` shown **on hover only** (title/tooltip).
  - If `value !== originalValue`, show a small **"edited"** marker.
- **Interactions:**
  - Clicking a `FieldRow` selects it → highlights its `bbox` on the left image and
    applies the teal selected-row treatment.
  - Editing an input → `updateField` (updates state, may toggle the "edited" marker).
  - "Mark as reviewed" → `markReviewed` (status → `ready`, sets `reviewedAt`).
  - "Export → JSON/CSV" → download a file built from the **current** document state.

## 8. Reusable Components (`src/components/`)

| Component | Responsibility | Depends on |
|---|---|---|
| `StatusPill` | renders a status as a colored pill + square indicator | tokens |
| `FormTypeBadge` | renders `formType` as a bordered badge | tokens |
| `ConfidenceIndicator` | tiered confidence (square flag + hover %) | tokens, `lib/format` |
| `FieldRow` | label/box, editable input, confidence, edited marker | `ConfidenceIndicator`, `lib/format` |
| `UploadZone` | drag-drop + click-to-browse multi-file input | tokens |
| `DocumentTable` | the Home table of documents | `StatusPill`, `FormTypeBadge` |
| `DocumentViewer` | `<img>` + positioned bbox highlight overlay | tokens |

Helpers:
- `lib/format.ts` — `confidenceTier(n)`, currency/SSN/EIN display formatting,
  percentage formatting for hover.
- `lib/export.ts` — `toJSON(doc)`, `toCSV(doc)`, and a `downloadFile(name, mime, content)`
  client-side download helper.

## 9. Cross-Cutting States

- **Loading / processing:** `processing` status pill; Review of a still-processing doc
  shows a processing state rather than empty fields.
- **Empty:** Home with no documents → centered upload zone only.
- **Error:** Review with an unknown `:id` → "Document not found" + back link.
  `failed` documents are openable read-only and clearly marked.
- **Partial extraction:** render exactly the fields that exist (`doc.fields` may be
  shorter than 7, or empty). The viewer only draws a highlight for a selected field
  that has a `bbox`. **Never crash on missing fields.**

## 10. File Structure

```
taxform_automation/
  package.json
  vite.config.ts
  tsconfig.json · tsconfig.node.json
  wrangler.jsonc
  index.html
  src/
    worker.ts                 # CF Worker: ASSETS passthrough, ready for /api/*
    main.tsx                  # React root + BrowserRouter + DocumentsProvider
    App.tsx                   # <Routes>: '/' and '/review/:id'
    index.css                 # tailwind + @theme tokens + @font-face Satoshi
    types.ts                  # Document, Field (exact contract)
    fixtures.ts               # 5 mock W-2 documents + hand-tuned bboxes
    state/DocumentsContext.tsx
    lib/format.ts
    lib/export.ts
    pages/Home.tsx
    pages/Review.tsx
    components/
      StatusPill.tsx · FormTypeBadge.tsx · ConfidenceIndicator.tsx ·
      FieldRow.tsx · UploadZone.tsx · DocumentTable.tsx · DocumentViewer.tsx
    assets/
      w2-sample.(png|svg)
      fonts/                  # self-hosted Satoshi woff2
```

## 11. Build Plan (subagents, phased)

Each agent owns **disjoint files**; phase boundaries are sync points so a dependency
exists before its dependents import it. The main session reviews between phases.
Dispatched with the Agent tool in parallel per phase (not the Workflow orchestrator).

- **Phase 0 — Foundation (1 agent, sequential first):** full scaffold + configs +
  `wrangler.jsonc` + `worker.ts` + `index.css` `@theme` tokens + Satoshi `@font-face` +
  `types.ts` + `fixtures.ts` + W-2 image asset + `DocumentsContext` + `lib/format.ts` +
  `lib/export.ts`. Establishes every shared interface. Must compile/typecheck before fan-out.
- **Phase 1 — Primitives (3 parallel):** `StatusPill`, `FormTypeBadge`, `ConfidenceIndicator`.
- **Phase 2 — Composites (4 parallel):** `FieldRow`, `DocumentTable`, `UploadZone`, `DocumentViewer`.
- **Phase 3 — Pages (2 parallel):** `Home`, `Review`.
- **Phase 4 — Integration & verification (1 agent + main session):** wire `App` routes,
  then **`npm run build` + typecheck + `wrangler dev` smoke test**; fix cross-cutting gaps.

## 12. Out of Scope (do not build)

Auth · multi-client folders · multi-page documents · form types other than W-2 ·
real persistence · real extraction · API routes.
