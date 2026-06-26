# Guide / Get-started Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/guide` page that orients a new reviewer with four screenshot steps, reached from the landing page "Get started" button and leading into the tool via a bottom-right "Next" button.

**Architecture:** A new presentational `Guide` page component is added to the React Router route table. The landing button retargets from `/app` to `/guide`, and the guide's "Next" button links to `/app`. Step screenshots are captured from real app states with a standalone Playwright script and committed as static assets under `public/guide/`.

**Tech Stack:** React 18, React Router v7, Tailwind CSS v4, Vitest + Testing Library, Playwright (Chromium) for screenshot capture, vite-node for the script runner.

## Global Constraints

- Never use em dashes or en dashes in any file, code, comment, or commit message. Use a comma instead.
- Do not add `Co-Authored-By` trailers to commits in this repo.
- Tests use Vitest globals (`test`, `expect`, `vi`) and `@testing-library/react`, following the existing `src/pages/*.test.tsx` pattern.
- Styling uses the existing Tailwind theme tokens: `bg-paper`, `text-ink`, `text-muted`, `bg-accent`, `border-border`, and `rounded-[3px]`.
- Run the test suite with `npm test` (which runs `vitest run`).

## File Structure

- Create `src/pages/Guide.tsx`: the guide page (header, intro, four step sections, bottom-right Next button). Pure presentational, no app state.
- Create `src/pages/Guide.test.tsx`: component tests for the guide.
- Modify `src/App.tsx`: add the `/guide` route.
- Modify `src/pages/Landing.tsx`: retarget "Get started" from `/app` to `/guide`.
- Modify `src/pages/Landing.test.tsx`: assert the retargeted link.
- Modify `src/components/UploadZone.tsx`: add `data-testid="upload-zone"` so the capture script can target the upload area.
- Create `scripts/capture-guide-shots.ts`: standalone Playwright capture script (not imported by the app bundle).
- Modify `package.json`: add `playwright` dev dependency and a `capture-guide` npm script.
- Create `public/guide/step-1-upload.png` … `step-4-export.png`: committed screenshot assets (produced by the script).

---

## Task 1: Guide page, route, and landing retarget

**Files:**
- Create: `src/pages/Guide.tsx`
- Create: `src/pages/Guide.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Landing.tsx:23` (the `to="/app"` on the Get started link)
- Modify: `src/pages/Landing.test.tsx:13`

**Interfaces:**
- Produces: `Guide` default export, a React component taking no props. It references screenshot URLs `/guide/step-1-upload.png`, `/guide/step-2-extraction.png`, `/guide/step-3-review.png`, `/guide/step-4-export.png`, which Task 2 generates.
- Consumes: React Router `Link` and the existing app routes `/` and `/app`.

- [ ] **Step 1: Update the Landing test to expect the new target**

In `src/pages/Landing.test.tsx`, change the final assertion from `/app` to `/guide`:

```tsx
  expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/guide')
```

- [ ] **Step 2: Run the Landing test to verify it fails**

Run: `npm test -- src/pages/Landing.test.tsx`
Expected: FAIL, the link still has `href="/app"`.

- [ ] **Step 3: Retarget the Landing button**

In `src/pages/Landing.tsx`, change the Get started link target:

```tsx
      <Link
        to="/guide"
        className="mt-8 inline-flex items-center gap-2 rounded-[3px] bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b5d56] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
```

- [ ] **Step 4: Run the Landing test to verify it passes**

Run: `npm test -- src/pages/Landing.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing Guide test**

Create `src/pages/Guide.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Guide from './Guide'

test('guide renders the four steps with screenshots', () => {
  render(
    <MemoryRouter>
      <Guide />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: /how taxextract works/i })).toBeInTheDocument()
  for (const title of ['Upload', 'Automatic extraction', 'Review and edit', 'Export']) {
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  }
  expect(screen.getAllByRole('img')).toHaveLength(4)
})

test('guide Next button links into the app', () => {
  render(
    <MemoryRouter>
      <Guide />
    </MemoryRouter>,
  )
  expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute('href', '/app')
})
```

- [ ] **Step 6: Run the Guide test to verify it fails**

Run: `npm test -- src/pages/Guide.test.tsx`
Expected: FAIL, cannot resolve `./Guide`.

- [ ] **Step 7: Create the Guide page**

Create `src/pages/Guide.tsx`:

```tsx
import { Link } from 'react-router-dom'

type Step = { number: number; title: string; description: string; image: string; alt: string }

const STEPS: Step[] = [
  {
    number: 1,
    title: 'Upload',
    description:
      'Drag and drop your W-2 or 1099 PDFs onto the upload area, or click to browse. You can upload several at once.',
    image: '/guide/step-1-upload.png',
    alt: 'The upload area where you drop W-2 and 1099 PDFs',
  },
  {
    number: 2,
    title: 'Automatic extraction',
    description:
      'Each document is read automatically and labeled ready, needs review, or failed. Fields with low confidence or missing values are flagged for you.',
    image: '/guide/step-2-extraction.png',
    alt: 'The document list showing extracted forms with ready, needs review, and failed statuses',
  },
  {
    number: 3,
    title: 'Review and edit',
    description:
      'Open a document to check the extracted fields against the original PDF side by side. Fix any flagged field inline before you sign off.',
    image: '/guide/step-3-review.png',
    alt: 'The review screen with the PDF next to the extracted fields and confidence indicators',
  },
  {
    number: 4,
    title: 'Export',
    description:
      'When the fields look right, mark the document as reviewed and export the data as JSON or CSV.',
    image: '/guide/step-4-export.png',
    alt: 'The export menu on the review screen with JSON and CSV options',
  },
]

export default function Guide() {
  return (
    <div className="min-h-screen bg-paper pb-28">
      <header className="flex items-center gap-2.5 border-b border-border bg-white px-4 py-3 text-sm font-semibold">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-ink" />
          TaxExtract
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-black tracking-tight text-ink sm:text-4xl">How TaxExtract works</h1>
        <p className="mt-3 text-muted">
          A quick walkthrough before you start. TaxExtract reads your W-2 and 1099 forms and pulls
          out every field for review.
        </p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          W-2 · 1099-NEC · 1099-INT · 1099-DIV
        </p>

        <ol className="mt-10 space-y-12">
          {STEPS.map((step) => (
            <li key={step.number}>
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                  {step.number}
                </span>
                <h2 className="text-xl font-bold text-ink">{step.title}</h2>
              </div>
              <p className="mt-3 text-muted">{step.description}</p>
              <img
                src={step.image}
                alt={step.alt}
                className="mt-4 w-full rounded-[3px] border border-border shadow-sm"
              />
            </li>
          ))}
        </ol>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-end px-6 py-3">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-[3px] bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0b5d56] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Next
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run the Guide test to verify it passes**

Run: `npm test -- src/pages/Guide.test.tsx`
Expected: PASS, both tests green.

- [ ] **Step 9: Register the /guide route**

In `src/App.tsx`, import the page and add the route:

```tsx
import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Guide from './pages/Guide'
import Home from './pages/Home'
import Review from './pages/Review'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="/app" element={<Home />} />
      <Route path="/review/:id" element={<Review />} />
    </Routes>
  )
}
```

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: PASS, all existing tests plus the new Guide tests.

- [ ] **Step 11: Commit**

```bash
git add src/pages/Guide.tsx src/pages/Guide.test.tsx src/App.tsx src/pages/Landing.tsx src/pages/Landing.test.tsx
git commit -m "feat: guide/get-started page reached from landing, leading into the tool"
```

---

## Task 2: Screenshot capture script and committed assets

**Files:**
- Modify: `package.json` (add `playwright` dev dependency and `capture-guide` script)
- Modify: `src/components/UploadZone.tsx:12-16` (add `data-testid="upload-zone"` to the root div)
- Create: `scripts/capture-guide-shots.ts`
- Create: `public/guide/step-1-upload.png`, `step-2-extraction.png`, `step-3-review.png`, `step-4-export.png`

**Interfaces:**
- Consumes: the running app routes `/app` and `/review/:id`, the `data-testid="upload-zone"` hook, the existing `data-testid="pdf-canvas"` on the review viewer, the "Export" button accessible name, and fixture ids `doc-jdoe` and `doc-acme`.
- Produces: four PNG files under `public/guide/` referenced by `Guide.tsx` from Task 1.

- [ ] **Step 1: Install Playwright and the Chromium browser**

```bash
npm install -D playwright
npx playwright install chromium
```

Note: this repo uses `@lavamoat/allow-scripts`. If `npm install` reports `playwright` as a disallowed install script, that is expected. The browser binary is fetched by the explicit `npx playwright install chromium` command above, so you can proceed without allowing the postinstall.

- [ ] **Step 2: Add the upload-zone test id**

In `src/components/UploadZone.tsx`, add `data-testid="upload-zone"` to the root drop-target `<div>` (the one with the dashed border):

```tsx
    <div
      data-testid="upload-zone"
```

Keep every other attribute on that div unchanged.

- [ ] **Step 3: Add the capture-guide npm script**

In `package.json`, add to `scripts`:

```json
    "capture-guide": "vite-node scripts/capture-guide-shots.ts",
```

- [ ] **Step 4: Write the capture script**

Create `scripts/capture-guide-shots.ts`:

```ts
// Manual screenshot-capture script. NOT part of the test suite.
// Drives the running app with Playwright and writes the guide screenshots to public/guide/.
//
// Run: start the app first in another terminal (for example `npm run dev`), then:
//   GUIDE_BASE_URL=http://localhost:5173 npm run capture-guide
// GUIDE_BASE_URL defaults to http://localhost:5173. Point it at whatever port the
// dev server is actually serving (Vite picks the next free port if 5173 is taken).
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseUrl = process.env.GUIDE_BASE_URL ?? 'http://localhost:5173'
const outDir = fileURLToPath(new URL('../public/guide/', import.meta.url))
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()

// Step 1: the upload area at the top of the tool.
await page.goto(`${baseUrl}/app`, { waitUntil: 'networkidle' })
await page.getByTestId('upload-zone').screenshot({ path: `${outDir}step-1-upload.png` })
console.log('captured step-1-upload.png')

// Step 2: the document list with mixed statuses.
await page.getByText('Review →').first().waitFor()
await page.screenshot({ path: `${outDir}step-2-extraction.png` })
console.log('captured step-2-extraction.png')

// Step 3: the review screen (blurry W-2, needs review). Wait for the PDF canvas to render.
await page.goto(`${baseUrl}/review/doc-jdoe`, { waitUntil: 'networkidle' })
await page.getByTestId('pdf-canvas').waitFor()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${outDir}step-3-review.png` })
console.log('captured step-3-review.png')

// Step 4: the export menu open on a reviewed W-2.
await page.goto(`${baseUrl}/review/doc-acme`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /export/i }).click()
await page.getByText('JSON').waitFor()
await page.screenshot({ path: `${outDir}step-4-export.png` })
console.log('captured step-4-export.png')

await browser.close()
console.log('done')
```

- [ ] **Step 5: Start the dev server**

In a separate terminal:

```bash
npm run dev
```

Note the port it prints (for example `http://localhost:5173/` or `5174/` if 5173 is busy).

- [ ] **Step 6: Run the capture script**

Using the port from Step 5 (replace 5173 if different):

```bash
GUIDE_BASE_URL=http://localhost:5173 npm run capture-guide
```

Expected output: four `captured ...` lines then `done`.

- [ ] **Step 7: Verify the four screenshots exist and are non-empty**

```bash
ls -l public/guide/
```

Expected: `step-1-upload.png`, `step-2-extraction.png`, `step-3-review.png`, `step-4-export.png`, each with a non-zero size. Open them and confirm: step 1 shows the dashed upload area, step 2 shows the document list with status pills, step 3 shows the review screen with the rendered PDF and fields, step 4 shows the open Export menu with JSON and CSV.

- [ ] **Step 8: Confirm the guide renders the real screenshots**

With the dev server running, open `http://localhost:5173/guide` in a browser and confirm the four images load (not broken) and the bottom-right Next button goes to `/app`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json scripts/capture-guide-shots.ts src/components/UploadZone.tsx public/guide/step-1-upload.png public/guide/step-2-extraction.png public/guide/step-3-review.png public/guide/step-4-export.png
git commit -m "feat: capture script and committed step screenshots for the guide page"
```

---

## Self-Review

**Spec coverage:**
- Flow and routing (landing button to `/guide`, Next to `/app`, every-time display, header wordmark home link): Task 1 Steps 3, 7, 9.
- Page structure (header, intro, supported-forms line, four step sections, sticky bottom-right Next): Task 1 Step 7.
- The four steps and their screenshot sources: Task 1 Step 7 (copy and image wiring) and Task 2 Step 4 (capture from `doc-jdoe`, `doc-acme`, `/app`).
- Screenshot capture mechanics (Playwright dev dependency, `scripts/capture-guide-shots.ts`, retina PNGs to `public/guide/`, `capture-guide` npm script): Task 2 Steps 1, 3, 4, 6.
- Components and boundaries (`Guide.tsx` presentational, local step model, standalone script, edits to `App.tsx` and `Landing.tsx`): Task 1 and Task 2 file lists.
- Testing (Guide component test for four titles, images with alt, Next to `/app`; Landing link to `/guide`; script not unit tested): Task 1 Steps 1, 5; Task 2 verification Steps 7, 8.
- Out of scope items: none introduced.

**Placeholder scan:** No TBD, TODO, or vague steps. Every code step shows complete code.

**Type consistency:** `STEPS` items use `{ number, title, description, image, alt }` consistently between the type and the data. Screenshot filenames (`step-1-upload.png` … `step-4-export.png`) match between `Guide.tsx` (Task 1) and the capture script and commit (Task 2). Test ids `upload-zone` (added Task 2 Step 2) and `pdf-canvas` (existing) match the capture script selectors.
