import { buildProfile, type Profile, type TubeSpec } from './profile'

export type JointType = 'saddle' | 'elbow'
export type FitMode = 'safe' | 'outer' | 'inner' | 'mean'

export interface JointConfig {
  type: JointType
  branch: TubeSpec
  header: TubeSpec
  /** saddle: angle between branch and header axes, degrees (15..90) */
  angle: number
  /** saddle: offset of branch axis from header axis (across), mm */
  offset: number
  /** saddle: branch length measured at its longest point */
  branchLen: number
  headerLen: number
  /** elbow: total change of direction, degrees */
  elbowAngle: number
  segments: number
  /** elbow: centre-line bend radius (0 allowed for 2 segments) */
  bendRadius: number
  /** elbow: straight tail length on both end pieces */
  tail: number
  fit: FitMode
  hole: boolean
}

export type V3 = [number, number, number]

export interface Frame {
  o: V3
  u: V3 // tube axis
  v: V3 // local a direction (0°)
  w: V3 // local b direction (90°)
}

export interface EndCut {
  side: 'bottom' | 'top' // bottom: material lies at z above the cut
  square: boolean
  /** ideal cut surface: z as function of local (a, b) */
  ideal: (a: number, b: number) => number
  /** template z per profile sample (radial cut, chosen fit mode) */
  z: number[]
  name: string
}

export interface Piece {
  id: string
  name: string
  role: 'header' | 'branch' | 'segment'
  spec: TubeSpec
  profile: Profile
  frame: Frame
  bottom: EndCut
  top: EndCut
  templated: boolean
  /** how many identical pieces to cut from this template */
  qty: number
  /** meaning of the 0° and 180° lines for the template legend */
  legend: string
}

export interface HoleCurve {
  kind: 'round' | 'flat'
  /** closed curve in header unrolled coords: x along header axis, y = arc length (round) or across (flat) */
  pts: [number, number][]
  wrapPerimeter: number
  /** x where the branch axis pierces the header surface */
  axisX: number
}

export interface Assembly {
  pieces: Piece[]
  warnings: string[]
  hole?: HoleCurve
  facts: { label: string; value: string }[]
}

const d2r = Math.PI / 180

function add(...vs: V3[]): V3 {
  return vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0] as V3)
}
function mul(v: V3, k: number): V3 {
  return [v[0] * k, v[1] * k, v[2] * k]
}

export function toWorld(f: Frame, a: number, b: number, z: number): V3 {
  return add(f.o, mul(f.u, z), mul(f.v, a), mul(f.w, b))
}

function makeEnd(
  profile: Profile,
  side: 'bottom' | 'top',
  ideal: (a: number, b: number) => number,
  fit: FitMode,
  square: boolean,
  name: string,
): EndCut {
  const z: number[] = profile.outer.map((o, i) => {
    const n = profile.inner[i]
    if (square) return ideal(o.a, o.b)
    const fo = ideal(o.a, o.b)
    const fi = ideal(n.a, n.b)
    if (fit === 'outer') return fo
    if (fit === 'inner') return fi
    if (fit === 'mean') return ideal((o.a + n.a) / 2, (o.b + n.b) / 2)
    // safe: sample across the wall and keep the value that removes the most material
    let best = fo
    for (let k = 0; k <= 4; k++) {
      const t = k / 4
      const val = ideal(o.a + (n.a - o.a) * t, o.b + (n.b - o.b) * t)
      best = side === 'bottom' ? Math.max(best, val) : Math.min(best, val)
    }
    return best
  })
  return { side, square, ideal, z, name }
}

function constEnd(profile: Profile, side: 'bottom' | 'top', z0: number, name: string): EndCut {
  return makeEnd(profile, side, () => z0, 'outer', true, name)
}

export function buildAssembly(cfg: JointConfig): Assembly {
  return cfg.type === 'saddle' ? buildSaddle(cfg) : buildElbow(cfg)
}

function buildSaddle(cfg: JointConfig): Assembly {
  const warnings: string[] = []
  const th = Math.min(Math.max(cfg.angle, 5), 90) * d2r
  const e = cfg.offset
  const sin = Math.sin(th)
  const cos = Math.cos(th)
  const bp = buildProfile(cfg.branch)
  const hp = buildProfile({ ...cfg.header, w: cfg.header.h, h: cfg.header.w })
  const round = cfg.header.kind === 'round'
  const R = cfg.header.od / 2
  const faceY = cfg.header.h / 2 // rect header: top face height (a = height direction)
  const halfAcross = round ? R : cfg.header.w / 2

  let clamped = false
  const surf = (b: number) => {
    if (!round) return faceY
    const q = R * R - (e + b) * (e + b)
    if (q < 0) {
      clamped = true
      return 0
    }
    return Math.sqrt(q)
  }
  const ideal = (a: number, b: number) => (surf(b) - a * cos) / sin

  if (Math.abs(e) + bp.halfB > halfAcross + 1e-6) {
    warnings.push(
      round
        ? `Ống nhánh (${fmt2(bp.halfB * 2)}mm) + lệch tâm ${fmt2(e)}mm vượt quá đường kính ống chính — đường cắt bị cắt cụt ở mép.`
        : `Ống nhánh + lệch tâm vượt quá bề rộng mặt hộp chính (${fmt2(cfg.header.w)}mm).`,
    )
  }
  if (cfg.branch.kind === 'round' && round && Math.abs(Math.abs(e) + bp.halfB - R) < 0.05 && e === 0) {
    warnings.push('Hai ống cùng đường kính: mũi cắt 2 bên rất nhọn, nên chừa 1–2 mm và mài chỉnh khi hàn.')
  }

  const bottom = makeEnd(bp, 'bottom', ideal, cfg.fit, false, 'Đầu ghép')
  const zmin = Math.min(...bottom.z)
  const zmax = Math.max(...bottom.z)
  const top = constEnd(bp, 'top', zmin + cfg.branchLen, 'Đầu vuông')
  if (clamped) warnings.push('Một phần biên dạng ống nhánh nằm ngoài ống chính (đã kẹp giá trị).')
  if (cfg.branchLen <= zmax - zmin) warnings.push('Chiều dài ống nhánh ngắn hơn chiều sâu đường cắt.')

  const u: V3 = [cos, sin, 0]
  const v: V3 = [-sin, cos, 0]
  const w: V3 = [0, 0, 1]
  const branchFrame: Frame = { o: [0, 0, e], u, v, w }

  const L = cfg.headerLen
  const header: Piece = {
    id: 'header',
    name: 'Ống chính',
    role: 'header',
    spec: cfg.header,
    profile: hp,
    frame: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] },
    bottom: constEnd(hp, 'bottom', -L / 2, 'Đầu A'),
    top: constEnd(hp, 'top', L / 2, 'Đầu B'),
    templated: false,
    qty: 1,
    legend: '',
  }
  const branch: Piece = {
    id: 'branch',
    name: 'Ống nhánh',
    role: 'branch',
    spec: cfg.branch,
    profile: bp,
    frame: branchFrame,
    bottom,
    top,
    templated: true,
    qty: 1,
    legend:
      cfg.angle >= 89.99
        ? '0° / 180°: dọc theo trục ống chính · 90° / 270°: hai bên hông'
        : '0°: phía góc tù · 180°: phía góc nhọn',
  }

  // hole in the header, traced by the branch inner surface
  let hole: HoleCurve | undefined
  if (cfg.hole) {
    const pts: [number, number][] = bp.inner.map((n) => {
      const z = ideal(n.a, n.b)
      const W = toWorld(branchFrame, n.a, n.b, z)
      return round ? ([W[0], R * Math.atan2(W[2], W[1])] as [number, number]) : ([W[0], W[2]] as [number, number])
    })
    const pierce = round ? Math.sqrt(Math.max(R * R - e * e, 0)) : faceY
    hole = { kind: round ? 'round' : 'flat', pts, wrapPerimeter: round ? Math.PI * cfg.header.od : 0, axisX: (pierce * cos) / sin }
  }

  const facts = [
    { label: 'Chu vi cữ (quấn ngoài)', value: `${fmt2(bp.perimeter)} mm` },
    { label: 'Độ sâu đường cắt', value: `${fmt2(zmax - zmin)} mm` },
    { label: 'Góc giữa 2 ống', value: `${fmt2(cfg.angle)}°` },
    { label: 'Dài nhất / ngắn nhất', value: `${fmt2(cfg.branchLen)} / ${fmt2(cfg.branchLen - (zmax - zmin))} mm` },
  ]
  return { pieces: [header, branch], warnings, hole, facts }
}

function buildElbow(cfg: JointConfig): Assembly {
  const warnings: string[] = []
  const n = Math.max(2, Math.round(cfg.segments))
  const D = Math.min(Math.max(cfg.elbowAngle, 1), 179) * d2r
  const delta = D / (n - 1)
  const g = delta / 2
  const tg = Math.tan(g)
  const Rb = n === 2 ? Math.max(cfg.bendRadius, 0) : cfg.bendRadius
  const T = cfg.tail
  const pr = buildProfile(cfg.branch)
  const ha = pr.halfA
  const Lc = 2 * Rb * tg

  if (n > 2 && Rb <= ha) warnings.push(`Bán kính uốn phải lớn hơn ${fmt2(ha)} mm (nửa kích thước ống), nếu không đốt giữa bị âm chiều dài bụng.`)
  if (T + (Rb - ha) * tg < 0) warnings.push('Đoạn thẳng đầu quá ngắn — đầu cắt vát ăn vào hết đoạn ống.')

  const pieces: Piece[] = []
  let o: V3 = [0, 0, 0]
  let u: V3 = [1, 0, 0]
  let v: V3 = [0, -1, 0]
  const w: V3 = [0, 0, -1] // keeps (u, v, w) right-handed
  const legend = '0°: lưng cút (phía ngoài, dài nhất) · 180°: bụng cút (phía trong, ngắn nhất)'
  const rotate = () => {
    const cu = Math.cos(delta)
    const su = Math.sin(delta)
    const nu: V3 = add(mul(u, cu), mul(v, -su))
    const nv: V3 = add(mul(u, su), mul(v, cu))
    u = nu
    v = nv
  }
  for (let k = 0; k < n; k++) {
    const frame: Frame = { o, u, v, w }
    let bottom: EndCut
    let top: EndCut
    let len: number
    if (k === 0) {
      len = T + Rb * tg
      bottom = constEnd(pr, 'bottom', 0, 'Đầu vuông')
      top = makeEnd(pr, 'top', (a) => len + a * tg, cfg.fit, false, 'Đầu vát')
    } else if (k === n - 1) {
      len = Rb * tg + T
      bottom = makeEnd(pr, 'bottom', (a) => -a * tg, cfg.fit, false, 'Đầu vát')
      top = constEnd(pr, 'top', len, 'Đầu vuông')
    } else {
      len = Lc
      bottom = makeEnd(pr, 'bottom', (a) => -a * tg, cfg.fit, false, 'Đầu vát dưới')
      top = makeEnd(pr, 'top', (a) => Lc + a * tg, cfg.fit, false, 'Đầu vát trên')
    }
    const name = k === 0 ? 'Đốt đầu' : k === n - 1 ? 'Đốt cuối' : `Đốt giữa ${k}`
    pieces.push({
      id: `seg${k}`,
      name,
      role: 'segment',
      spec: cfg.branch,
      profile: pr,
      frame,
      bottom,
      top,
      // the last piece is identical to the first one (mirrored) and middles are identical
      templated: k === 0 || (k === 1 && n > 2),
      qty: k === 0 ? 2 : k === n - 1 ? 2 : n - 2,
      legend,
    })
    o = add(o, mul(u, len))
    if (k < n - 1) rotate()
  }
  const facts = [
    { label: 'Góc vát mỗi mối', value: `${fmt2(g / d2r)}°` },
    { label: 'Góc giữa 2 đầu ống', value: `${fmt2(180 - cfg.elbowAngle)}°` },
    { label: 'Chu vi cữ (quấn ngoài)', value: `${fmt2(pr.perimeter)} mm` },
  ]
  if (n > 2) {
    facts.push({ label: 'Đốt giữa: lưng / tâm / bụng', value: `${fmt2(Lc + 2 * ha * tg)} / ${fmt2(Lc)} / ${fmt2(Lc - 2 * ha * tg)} mm` })
    facts.push({ label: 'Số đốt giữa cần cắt', value: `${n - 2}` })
  }
  return { pieces, warnings, facts }
}

function fmt2(x: number) {
  return (Math.round(x * 10) / 10).toString()
}
