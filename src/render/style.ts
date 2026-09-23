import type { Stroke } from '../core/template'

export const STROKES: Record<Stroke, { w: number; c: string; dash?: number[] }> = {
  cut: { w: 0.45, c: '#111111' },
  outline: { w: 0.2, c: '#666666' },
  ref: { w: 0.3, c: '#1d5fd1', dash: [3, 1.5] },
  fold: { w: 0.25, c: '#333333', dash: [1.4, 1.2] },
  tick: { w: 0.15, c: '#333333' },
  tab: { w: 0.2, c: '#888888', dash: [2, 1] },
  quad: { w: 0.25, c: '#c2410c', dash: [5, 1.5, 1, 1.5] },
}

export const WASTE_FILL = '#dcdcdc'
export const TEXT = '#111111'
export const TEXT_MUTED = '#555555'
export const FONT = "'Be Vietnam Pro', system-ui, sans-serif"
