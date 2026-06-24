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
