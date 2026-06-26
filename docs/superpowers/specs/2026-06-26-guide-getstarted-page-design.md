# Guide / Get-started page design

Date: 2026-06-26
Status: Approved, ready for implementation plan

## Goal

Give a new reviewer a short, visual orientation to TaxExtract before they reach
the tool. After clicking "Get started" on the landing page, the reviewer sees a
guide page that walks through the four steps of the process with a real
screenshot and a short description for each, then continues into the tool via a
"Next" button at the bottom right.

## Flow and routing

- Add a new route `/guide` rendering a `Guide` page component.
- The landing page (`src/pages/Landing.tsx`) "Get started" button changes its
  target from `/app` to `/guide`.
- The guide page has a "Next" button fixed to the bottom right that links to
  `/app` (the tool).
- The guide is shown every time "Get started" is clicked. It is a deliberate
  step in the entry flow, not a first-run-only overlay, so there is no
  localStorage or "don't show again" state.
- The guide page header keeps the TaxExtract wordmark linking home, so the page
  is not a forced wall.

Resulting route table in `src/App.tsx`:

- `/` -> Landing
- `/guide` -> Guide (new)
- `/app` -> Home (the tool)
- `/review/:id` -> Review

## Page structure

A single scrollable page, with a header consistent with the rest of the app
(TaxExtract wordmark), then:

1. Title and intro: "How TaxExtract works", plus a one-line note listing the
   supported forms (W-2, 1099-NEC, 1099-INT, 1099-DIV).
2. Four step sections. Each section has: step number, step title, a screenshot,
   and a short description.
3. A "Next" button fixed to the bottom right, sticky so it stays reachable while
   scrolling, linking to `/app`.

Visual treatment follows the existing app: paper background, teal accent,
Satoshi font, the same rounded corners and border colors used elsewhere. No new
animation beyond what the app already uses.

## The four steps

The screenshots are captured from real app states, using the existing fixtures
so the content is realistic.

| Step | Title | Description | Screenshot source |
|------|-------|-------------|-------------------|
| 1 | Upload | Drag and drop W-2 or 1099 PDFs, or click to browse. Uploading several at once is fine. | Upload zone at the top of `/app` |
| 2 | Automatic extraction | Each document is read and labeled ready, needs review (low-confidence or empty fields are flagged), or failed. | Document table on `/app`, which the fixtures populate with all three statuses |
| 3 | Review and edit | Open a document, check the extracted fields against the rendered PDF, and fix any flagged field inline. | `/review/doc-jdoe`, the blurry W-2 that is a needs-review example |
| 4 | Export | Mark the document as reviewed, then export JSON or CSV. | `/review/doc-acme` with the Export menu open |

## Screenshot capture mechanics

- Add Playwright (Chromium) as a dev dependency.
- Add a capture script `scripts/capture-guide-shots.ts`, alongside the existing
  `scripts/capture-fixtures.ts`.
- The script launches the running app, visits each state listed above (for step
  4 it clicks the "Export" button to open the menu), and writes retina PNGs
  (deviceScaleFactor 2) to `public/guide/`:
  - `public/guide/step-1-upload.png`
  - `public/guide/step-2-extraction.png`
  - `public/guide/step-3-review.png`
  - `public/guide/step-4-export.png`
- The guide page references these as static URLs (for example
  `/guide/step-1-upload.png`). They are committed image assets, so the running
  app needs no browser at runtime.
- Add an npm script `capture-guide` so the screenshots can be regenerated when
  the UI changes.
- The capture script points at a running dev server. It assumes the app is
  already serving (for example `npm run dev`) and reads its base URL from an
  env var with a sensible default, so a port change does not break it.

## Components and boundaries

- `src/pages/Guide.tsx`: the new page. Renders the header, the intro, the four
  step sections, and the Next button. Pure presentational, no app state.
- A small step model local to the page: an array of `{ number, title,
  description, image, alt }`, mapped to a `GuideStep` section. This keeps the
  copy and image wiring in one place and the markup uniform.
- `scripts/capture-guide-shots.ts`: standalone Playwright script, not imported
  by the app bundle.
- Edits to `src/App.tsx` (add route) and `src/pages/Landing.tsx` (retarget the
  button).

## Testing

- A component test for `Guide` (in the existing Vitest and Testing Library
  setup) that asserts: the four step titles render, each step has an image with
  alt text, and the Next button links to `/app`.
- A test that the Landing "Get started" link points to `/guide`.
- The screenshot script is not unit tested. It is a developer tool run on
  demand; its output (the PNGs) is committed and reviewed visually.

## Out of scope (YAGNI)

- No multi-step wizard or carousel. The Next button goes straight to the tool,
  it does not advance through steps.
- No "don't show again" persistence.
- No changes to the actual upload, extraction, review, or export behavior.
- No new animation beyond what the app already uses.
