# Extraction stress-test harness

Standalone accuracy/eval harness. It hits the LIVE Gemini API through the SAME
production `extractDocument` path (classify then extract). It is NOT part of the unit
suite and is not wired into CI. Run it locally with a real key. The harness is
form-parameterized: pick the form with the `FORM` env var (default `W-2`).

## One-time setup

1. Download the official IRS fillable PDF for the form and save it under
   `scripts/eval/assets/` (gitignored):
   - W-2: https://www.irs.gov/pub/irs-pdf/fw2.pdf saved as `scripts/eval/assets/fw2.pdf`
   - 1099-NEC: https://www.irs.gov/pub/irs-pdf/f1099nec.pdf saved as `scripts/eval/assets/f1099nec.pdf`
2. Confirm the AcroForm field names match the `fieldMap` for that form in `forms.ts`:

   ```
   DUMP_FIELDS=1 npx vite-node scripts/eval/make-form.ts                 # W-2
   FORM=1099-NEC DUMP_FIELDS=1 npx vite-node scripts/eval/make-form.ts   # 1099-NEC
   ```

   This prints every fillable field name and exits. If `make-form.ts` later stops with
   "fieldMap names not found", reconcile that form's `fieldMap` in `forms.ts` against
   this list (the IRS forms repeat fields per copy; use the page-1 copy names). The
   1099-NEC `fieldMap` ships as a best guess and is expected to need reconciliation.

## Run the full eval

```
GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts                 # W-2 (default)
FORM=1099-NEC GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts   # 1099-NEC
```

This generates the clean render plus all variants for the selected form into
`scripts/eval/out/`, runs each through the production `extractDocument`, and writes the
accuracy table to `scripts/eval/results.md` and the console. Set `SKIP_GEN=1` to reuse
an existing `out/` instead of regenerating images.

## Pure-logic tests (safe, no API)

```
npm test
```

`normalize.test.ts`, `score.test.ts`, `groundtruth.test.ts`, and
`groundtruth-nec.test.ts` run here. They never touch the API, the PDF, or sharp/canvas.

## Invariants

- The harness only READS bboxes. bbox normalization stays in `buildDocument`.
- If a bbox comes back out of the 0 to 100 range, that is flagged loudly as a possible
  production bug. The harness does not patch around it.
- Content edge cases score the RIGHT behavior: an empty, low-confidence answer where the
  spec demands it is a pass. A plausible hallucinated value is a fail.
