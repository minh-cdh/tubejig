// Tube cross-section profiles. Local 2D frame: a (in the joint plane), b (across).
// Samples go counter-clockwise starting at the a+ point (angle 0), closed (last = first, p = perimeter).

export type TubeKind = 'round' | 'rect'

export interface TubeSpec {
  kind: TubeKind
  od: number // round: outer diameter
  w: number // rect: extent along a
  h: number // rect: extent along b
  wall: number
  rc: number // rect: outer corner radius
}

export interface ProfilePt {
  a: number
  b: number
  na: number
  nb: number
  p: number // arc length along the OUTER perimeter at this station
}

export interface Profile {
  kind: TubeKind
  outer: ProfilePt[]
  inner: ProfilePt[]
  perimeter: number
  /** p positions of rect corners (fold lines) */
  folds: number[]
  /** p positions of the 4 face centres / quadrants, with labels */
  quadrants: { p: number; label: string }[]
  halfA: number
  halfB: number
}

type Seg =
  | { t: 'line'; a0: number; b0: number; a1: number; b1: number; na: number; nb: number }
  | { t: 'arc'; ca: number; cb: number; r: number; t0: number; t1: number }

function rectSegs(W: number, H: number, rc: number): Seg[] {
  const hw = W / 2
  const hh = H / 2
  const ea = hw - rc
  const eb = hh - rc
  const q = Math.PI / 2
  return [
    { t: 'line', a0: hw, b0: 0, a1: hw, b1: eb, na: 1, nb: 0 },
    { t: 'arc', ca: ea, cb: eb, r: rc, t0: 0, t1: q },
    { t: 'line', a0: ea, b0: hh, a1: -ea, b1: hh, na: 0, nb: 1 },
    { t: 'arc', ca: -ea, cb: eb, r: rc, t0: q, t1: 2 * q },
    { t: 'line', a0: -hw, b0: eb, a1: -hw, b1: -eb, na: -1, nb: 0 },
    { t: 'arc', ca: -ea, cb: -eb, r: rc, t0: 2 * q, t1: 3 * q },
    { t: 'line', a0: -ea, b0: -hh, a1: ea, b1: -hh, na: 0, nb: -1 },
    { t: 'arc', ca: ea, cb: -eb, r: rc, t0: 3 * q, t1: 4 * q },
    { t: 'line', a0: hw, b0: -eb, a1: hw, b1: 0, na: 1, nb: 0 },
  ]
}

function segLen(s: Seg) {
  return s.t === 'line' ? Math.hypot(s.a1 - s.a0, s.b1 - s.b0) : s.r * (s.t1 - s.t0)
}

function segAt(s: Seg, f: number): { a: number; b: number; na: number; nb: number } {
  if (s.t === 'line') {
    return { a: s.a0 + (s.a1 - s.a0) * f, b: s.b0 + (s.b1 - s.b0) * f, na: s.na, nb: s.nb }
  }
  const t = s.t0 + (s.t1 - s.t0) * f
  const na = Math.cos(t)
  const nb = Math.sin(t)
  return { a: s.ca + s.r * na, b: s.cb + s.r * nb, na, nb }
}

export function buildProfile(spec: TubeSpec, density = 1): Profile {
  if (spec.kind === 'round') {
    const ro = spec.od / 2
    const ri = Math.max(ro - spec.wall, 0.01)
    const N = Math.round(360 * density)
    const outer: ProfilePt[] = []
    const inner: ProfilePt[] = []
    for (let i = 0; i <= N; i++) {
      const phi = (i / N) * Math.PI * 2
      const c = Math.cos(phi)
      const s = Math.sin(phi)
      outer.push({ a: ro * c, b: ro * s, na: c, nb: s, p: ro * phi })
      inner.push({ a: ri * c, b: ri * s, na: c, nb: s, p: ro * phi })
    }
    const P = 2 * Math.PI * ro
    return {
      kind: 'round',
      outer,
      inner,
      perimeter: P,
      folds: [],
      quadrants: [0, 90, 180, 270].map((d) => ({ p: (P * d) / 360, label: `${d}°` })),
      halfA: ro,
      halfB: ro,
    }
  }

  const W = spec.w
  const H = spec.h
  const t = Math.min(spec.wall, Math.min(W, H) / 2 - 0.01)
  const rc = Math.min(Math.max(spec.rc, 0.3), Math.min(W, H) / 2 - 0.01)
  const ri = Math.max(rc - t, 0)
  const so = rectSegs(W, H, rc)
  const si = rectSegs(W - 2 * t, H - 2 * t, ri)
  const outer: ProfilePt[] = []
  const inner: ProfilePt[] = []
  const folds: number[] = []
  const quadrants: { p: number; label: string }[] = []
  const faceNames = ['0°', '90°', '180°', '270°']
  let p = 0
  so.forEach((s, k) => {
    const L = segLen(s)
    const n = s.t === 'arc' ? Math.max(6, Math.round(12 * density)) : Math.max(2, Math.ceil((L / 1.0) * density))
    if (k % 2 === 0 && k > 0 && k < 8) quadrants.push({ p: p + L / 2, label: faceNames[k / 2] })
    if (k === 0) quadrants.unshift({ p: 0, label: faceNames[0] })
    if (s.t === 'arc') folds.push(p + L / 2)
    for (let j = k === 0 ? 0 : 1; j <= n; j++) {
      const f = j / n
      const o = segAt(s, f)
      const ii = segAt(si[k], f)
      outer.push({ ...o, p: p + L * f })
      inner.push({ ...ii, na: o.na, nb: o.nb, p: p + L * f })
    }
    p += L
  })
  quadrants.sort((x, y) => x.p - y.p)
  return { kind: 'rect', outer, inner, perimeter: p, folds, quadrants, halfA: W / 2, halfB: H / 2 }
}

/** Interpolate a profile point (outer) at arc length p. */
export function profileAt(pr: Profile, p: number): { a: number; b: number; na: number; nb: number } {
  const pts = pr.outer
  const P = pr.perimeter
  let q = ((p % P) + P) % P
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].p <= q) lo = mid
    else hi = mid
  }
  const A = pts[lo]
  const B = pts[hi]
  const f = B.p > A.p ? (q - A.p) / (B.p - A.p) : 0
  let na = A.na + (B.na - A.na) * f
  let nb = A.nb + (B.nb - A.nb) * f
  const l = Math.hypot(na, nb) || 1
  na /= l
  nb /= l
  return { a: A.a + (B.a - A.a) * f, b: A.b + (B.b - A.b) * f, na, nb }
}

/** Linear interpolation of a per-sample value array at arc length p. */
export function valueAt(pr: Profile, vals: number[], p: number): number {
  const pts = pr.outer
  const P = pr.perimeter
  const q = ((p % P) + P) % P
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].p <= q) lo = mid
    else hi = mid
  }
  const f = pts[hi].p > pts[lo].p ? (q - pts[lo].p) / (pts[hi].p - pts[lo].p) : 0
  return vals[lo] + (vals[hi] - vals[lo]) * f
}

export function specLabel(s: TubeSpec): string {
  if (s.kind === 'round') return `Ø${fmt(s.od)} × ${fmt(s.wall)}`
  return `□${fmt(s.w)}×${fmt(s.h)} × ${fmt(s.wall)}`
}

export function fmt(n: number, d = 1): string {
  const r = Math.round(n * 10 ** d) / 10 ** d
  return String(r)
}
