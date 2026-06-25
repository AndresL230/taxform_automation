import { buildExtractPrompt, parseClassification, CLASSIFY_PROMPT } from './prompt'
import { W2_FORM } from './w2'
import { NEC_FORM } from './nec'

test('classify prompt and parser', () => {
  expect(CLASSIFY_PROMPT).toMatch(/classifier/i)
  expect(parseClassification({ detectedFormType: '1099-NEC' }).detectedFormType).toBe('1099-NEC')
  expect(() => parseClassification({})).toThrow()
})

test('extract prompt names the form and splices its fragment, keeps common rules', () => {
  const w2 = buildExtractPrompt(W2_FORM)
  expect(w2).toContain('single W-2 document')
  expect(w2).toContain('FIELDS TO EXTRACT (W-2)')
  expect(w2).toContain('BOUNDING BOXES')
  const nec = buildExtractPrompt(NEC_FORM)
  expect(nec).toContain('single 1099-NEC document')
  expect(nec).toContain('FIELDS TO EXTRACT (1099-NEC)')
  expect(nec).toContain('Never guess')
})
