# W-2 extraction stress-test harness

Standalone accuracy/eval harness. It hits the LIVE Gemini API through the SAME
production `extractW2` path. It is NOT part of the unit suite and is not wired
into CI. Run it locally with a real key.

## One-time setup

1. Download the official IRS fillable W-2 from https://www.irs.gov/pub/irs-pdf/fw2.pdf
   and save it as `scripts/eval/assets/fw2.pdf` (gitignored).
2. Confirm the AcroForm field names match `FIELD_MAP` in `make-w2.ts`:

   ```
   DUMP_FIELDS=1 npx vite-node scripts/eval/make-w2.ts
   ```

   This prints every fillable field name and exits. If `make-w2.ts` later stops
   with "FIELD_MAP names not found", reconcile `FIELD_MAP` against this list
   (the IRS form repeats fields per copy; use the page-1 copy names).

## Run the full eval

```
GEMINI_API_KEY=... npx vite-node scripts/eval/run.ts
```

This generates the clean render plus all variants into `scripts/eval/out/`,
runs each through `extractW2`, and writes the accuracy table to
`scripts/eval/results.md` and the console. Set `SKIP_GEN=1` to reuse an existing
`out/` instead of regenerating images.

## Pure-logic tests (safe, no API)

```
npm test
```

`normalize.test.ts`, `score.test.ts`, and `groundtruth.test.ts` run here. They
never touch the API, the PDF, or sharp/canvas.

## Invariants

- The harness only READS bboxes. bbox normalization stays in `buildW2Document`.
- If a bbox comes back out of the 0 to 100 range, that is flagged loudly as a
  possible production bug. The harness does not patch around it.
- Content edge cases score the RIGHT behavior: an empty, low-confidence answer
  where the spec demands it is a pass. A plausible hallucinated value is a fail.
