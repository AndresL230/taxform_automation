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
