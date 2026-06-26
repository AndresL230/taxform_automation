import type { BBox, Field } from '../types'

const EPS = 0.5 // tolerate edge rounding on the page bounds

// A bbox is renderable only if it sits inside the 0 to 100 page space. {0,0,0,0}
// (an empty field's box) is not renderable, which is correct: nothing to draw.
export function isBBoxRenderable(b: BBox): boolean {
  return (
    Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h) &&
    b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 &&
    b.x + b.w <= 100 + EPS && b.y + b.h <= 100 + EPS
  )
}

// Render-time grace for the unverified bbox pass-through. A value-bearing field with
// an unusable bbox degrades to "source not located" rather than drawing off canvas.
// An empty field is a no-op (no highlight, no warning).
export function locateField(field: Field): { highlight: BBox | null; sourceMissing: boolean } {
  if (field.value === '') return { highlight: null, sourceMissing: false }
  if (isBBoxRenderable(field.bbox)) return { highlight: field.bbox, sourceMissing: false }
  return { highlight: null, sourceMissing: true }
}
