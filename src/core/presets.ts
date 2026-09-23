import type { JointConfig } from './joint'
import type { TubeSpec } from './profile'

// Common sizes on the Vietnamese market (Hoa Phat / SeAH style catalogues)
export const ROUND_SIZES: { label: string; od: number }[] = [
  { label: 'Ø12.7', od: 12.7 },
  { label: 'Ø15.9', od: 15.9 },
  { label: 'Ø19.1', od: 19.1 },
  { label: 'Ø21 (21.2)', od: 21.2 },
  { label: 'Ø25.4', od: 25.4 },
  { label: 'Ø27 (26.65)', od: 26.65 },
  { label: 'Ø31.8', od: 31.8 },
  { label: 'Ø34 (33.5)', od: 33.5 },
  { label: 'Ø38.1', od: 38.1 },
  { label: 'Ø42 (42.2)', od: 42.2 },
  { label: 'Ø49 (48.1)', od: 48.1 },
  { label: 'Ø60 (59.9)', od: 59.9 },
  { label: 'Ø76 (75.6)', od: 75.6 },
  { label: 'Ø90 (88.3)', od: 88.3 },
  { label: 'Ø114 (113.5)', od: 113.5 },
  { label: 'Ø141 (141.3)', od: 141.3 },
  { label: 'Ø168 (168.3)', od: 168.3 },
]

export const RECT_SIZES: { label: string; w: number; h: number }[] = [
  { label: '12×12', w: 12, h: 12 },
  { label: '14×14', w: 14, h: 14 },
  { label: '20×20', w: 20, h: 20 },
  { label: '25×25', w: 25, h: 25 },
  { label: '30×30', w: 30, h: 30 },
  { label: '40×40', w: 40, h: 40 },
  { label: '50×50', w: 50, h: 50 },
  { label: '60×60', w: 60, h: 60 },
  { label: '75×75', w: 75, h: 75 },
  { label: '90×90', w: 90, h: 90 },
  { label: '100×100', w: 100, h: 100 },
  { label: '10×20', w: 20, h: 10 },
  { label: '13×26', w: 26, h: 13 },
  { label: '20×40', w: 40, h: 20 },
  { label: '25×50', w: 50, h: 25 },
  { label: '30×60', w: 60, h: 30 },
  { label: '40×80', w: 80, h: 40 },
  { label: '50×100', w: 100, h: 50 },
  { label: '60×120', w: 120, h: 60 },
]

export const round = (od: number, wall = 1.4): TubeSpec => ({ kind: 'round', od, w: od, h: od, wall, rc: 0 })
export const rect = (w: number, h: number, wall = 1.4): TubeSpec => ({ kind: 'rect', od: Math.max(w, h), w, h, wall, rc: Math.max(wall * 1.5, 1) })

export interface JointPreset {
  id: string
  name: string
  hint: string
  icon: string
  apply: (c: JointConfig) => JointConfig
}

export const defaultConfig = (): JointConfig => ({
  type: 'saddle',
  branch: round(42.2, 1.8),
  header: round(59.9, 2),
  angle: 90,
  offset: 0,
  branchLen: 160,
  headerLen: 320,
  elbowAngle: 90,
  segments: 2,
  bendRadius: 0,
  tail: 120,
  fit: 'safe',
  hole: false,
})

export const PRESETS: JointPreset[] = [
  {
    id: 'rr',
    name: 'Tròn ↔ tròn',
    hint: 'Chữ T / Y, cắt yên ngựa (miệng cá)',
    icon: 'rr',
    apply: (c) => ({ ...c, type: 'saddle', branch: c.branch.kind === 'round' ? c.branch : round(42.2, 1.8), header: c.header.kind === 'round' ? c.header : round(59.9, 2) }),
  },
  {
    id: 'rb',
    name: 'Tròn → hộp',
    hint: 'Ống tròn chống lên mặt hộp, vát xiên',
    icon: 'rb',
    apply: (c) => ({ ...c, type: 'saddle', branch: c.branch.kind === 'round' ? c.branch : round(33.5, 1.4), header: rect(50, 50, 1.8), angle: c.angle === 90 ? 60 : c.angle }),
  },
  {
    id: 'br',
    name: 'Hộp → tròn',
    hint: 'Sắt hộp tựa lên ống tròn',
    icon: 'br',
    apply: (c) => ({ ...c, type: 'saddle', branch: rect(30, 30, 1.4), header: c.header.kind === 'round' ? c.header : round(59.9, 2) }),
  },
  {
    id: 'bb',
    name: 'Hộp ↔ hộp',
    hint: 'Thanh chống xiên, giằng khung',
    icon: 'bb',
    apply: (c) => ({ ...c, type: 'saddle', branch: rect(30, 30, 1.4), header: rect(40, 80, 1.8), angle: 45 }),
  },
  {
    id: 'miter',
    name: 'Góc vát',
    hint: '2 ống nối góc, cắt xéo',
    icon: 'miter',
    apply: (c) => ({ ...c, type: 'elbow', segments: 2, bendRadius: 0, elbowAngle: 90 }),
  },
  {
    id: 'lobster',
    name: 'Cút tôm',
    hint: 'Co nhiều đốt từ ống thẳng',
    icon: 'lobster',
    apply: (c) => ({ ...c, type: 'elbow', segments: 5, bendRadius: Math.max(c.branch.od * 1.5, 60), elbowAngle: 90, tail: 60 }),
  },
]
