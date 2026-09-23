import type { Assembly, EndCut, HoleCurve, Piece } from './joint'
import { fmt, specLabel, valueAt, type Profile } from './profile'

export type Stroke = 'cut' | 'outline' | 'ref' | 'fold' | 'tick' | 'tab' | 'quad'

export type Item =
  | { t: 'poly'; pts: [number, number][]; s: Stroke; closed?: boolean }
  | { t: 'waste'; pts: [number, number][] }
  | { t: 'text'; x: number; y: number; text: string; size: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean; muted?: boolean; rot?: number }

export interface Station {
  label: string
  value: number
}

export interface Sheet {
  id: string
  pieceId: string
  title: string
  subtitle: string
  qty: number
  w: number
  h: number
  items: Item[]
  /** paper region (the part that wraps around the tube) for the 3D preview */
  wrap?: { x0: number; y0: number; P: number; zTop: number; zBottom: number }
  stations: { heading: string; rows: Station[] }
}

export interface TemplateOptions {
  /** full-length template when the piece is at most this tall, else one per cut end */
  fullMax: number
  refGap: number
  tab: number
  stations: number
}

export const defaultTemplateOptions: TemplateOptions = { fullMax: 260, refGap: 25, tab: 12, stations: 16 }

const TITLE_H = 22
const MX = 8
const MIN_W = 190

export function buildSheets(asm: Assembly, opt: TemplateOptions = defaultTemplateOptions): Sheet[] {
  const sheets: Sheet[] = []
  for (const pc of asm.pieces) {
    if (!pc.templated) continue
    const cutEnds = [pc.bottom, pc.top].filter((e) => !e.square)
    const zLo = Math.min(...pc.bottom.z)
    const zHi = Math.max(...pc.top.z)
    if (zHi - zLo <= opt.fullMax || cutEnds.length === 0) {
      sheets.push(fullSheet(pc, opt))
    } else {
      for (const e of cutEnds) sheets.push(endSheet(pc, e, opt))
    }
  }
  if (asm.hole) sheets.push(holeSheet(asm.hole, asm.pieces[0]))
  return sheets
}

interface Ctx {
  pc: Piece
  pr: Profile
  items: Item[]
  x0: number
  y0: number
  zTop: number
  xOf: (p: number) => number
  yOf: (z: number) => number
}

function frame(pc: Piece, zTop: number): Ctx {
  const items: Item[] = []
  const x0 = MX
  const y0 = TITLE_H + 6
  return {
    pc,
    pr: pc.profile,
    items,
    x0,
    y0,
    zTop,
    xOf: (p) => x0 + p,
    yOf: (z) => y0 + (zTop - z),
  }
}

function curvePts(c: Ctx, z: number[]): [number, number][] {
  return c.pr.outer.map((o, i) => [c.xOf(o.p), c.yOf(z[i])])
}

function drawPaper(c: Ctx, zTop: number, zBottom: number, opt: TemplateOptions) {
  const P = c.pr.perimeter
  const yT = c.yOf(zTop)
  const yB = c.yOf(zBottom)
  c.items.push({ t: 'poly', s: 'outline', closed: true, pts: [[c.xOf(0), yT], [c.xOf(P), yT], [c.xOf(P), yB], [c.xOf(0), yB]] })
  // glue tab
  const xt = c.xOf(P)
  c.items.push({ t: 'poly', s: 'tab', pts: [[xt, yT + 3], [xt + opt.tab, yT + 6], [xt + opt.tab, yB - 6], [xt, yB - 3]] })
  c.items.push({ t: 'text', x: xt + opt.tab / 2 + 1, y: (yT + yB) / 2, text: 'DÁN KEO', size: 2.4, anchor: 'middle', rot: -90, muted: true })
}

function drawQuadrants(c: Ctx, zTop: number, zBottom: number) {
  const P = c.pr.perimeter
  const yT = c.yOf(zTop)
  const yB = c.yOf(zBottom)
  for (const q of [...c.pr.quadrants, { p: P, label: '360°' }]) {
    const x = c.xOf(q.p)
    c.items.push({ t: 'poly', s: 'quad', pts: [[x, yT], [x, yB]] })
    c.items.push({ t: 'text', x: x + 0.8, y: yT + 3.4, text: q.label === '360°' && c.pr.kind === 'rect' ? '0°' : q.label, size: 2.8, bold: true })
  }
  for (const f of c.pr.folds) {
    const x = c.xOf(f)
    c.items.push({ t: 'poly', s: 'fold', pts: [[x, yT], [x, yB]] })
  }
  if (c.pr.kind === 'round') {
    for (let d = 15; d < 360; d += 15) {
      if (d % 90 === 0) continue
      const x = c.xOf((P * d) / 360)
      c.items.push({ t: 'poly', s: 'tick', pts: [[x, yT], [x, yT + (d % 45 === 0 ? 4 : 2.2)]] })
      c.items.push({ t: 'poly', s: 'tick', pts: [[x, yB], [x, yB - (d % 45 === 0 ? 4 : 2.2)]] })
    }
  }
}

function wastePoly(c: Ctx, z: number[], edgeZ: number): [number, number][] {
  const pts = curvePts(c, z)
  const P = c.pr.perimeter
  const ye = c.yOf(edgeZ)
  return [...pts, [c.xOf(P), ye], [c.xOf(0), ye]]
}

function titleBlock(items: Item[], title: string, lines: string[], w: number, h: number) {
  items.push({ t: 'text', x: MX, y: 7, text: title, size: 4.2, bold: true })
  lines.forEach((l, i) => items.push({ t: 'text', x: MX, y: 12 + i * 4, text: l, size: 2.7, muted: true }))
  // scale check bar: 50 mm, bottom right
  const x1 = w - MX
  const x0 = x1 - 50
  const y = h - 2.5
  items.push({ t: 'poly', s: 'cut', pts: [[x0, y], [x1, y]] })
  for (let k = 0; k <= 5; k++) {
    const x = x0 + k * 10
    items.push({ t: 'poly', s: 'tick', pts: [[x, y - (k % 5 === 0 ? 2.5 : 1.5)], [x, y]] })
  }
  items.push({ t: 'text', x: x0 - 2, y: y, text: 'Thước kiểm tra: đúng 50 mm', size: 2.4, anchor: 'end', muted: true })
}

function stationRows(pr: Profile, vals: (p: number) => number, n: number): Station[] {
  const rows: Station[] = []
  for (let k = 0; k < n; k++) {
    const p = (pr.perimeter * k) / n
    const label = pr.kind === 'round' ? `${fmt((360 * k) / n, 1)}°` : `${fmt(p, 0)} mm`
    rows.push({ label, value: vals(p) })
  }
  return rows
}

function pieceLines(pc: Piece): string[] {
  return [
    `${specLabel(pc.spec)} · Chu vi ${fmt(pc.profile.perimeter)} mm · Số lượng cắt: ${pc.qty}`,
    pc.legend,
    'Cắt giấy theo nét đậm, quấn khít quanh ống, mép 360° trùng vạch 0°. Vạch dấu rồi cắt phần gạch xám.',
  ]
}

function fullSheet(pc: Piece, opt: TemplateOptions): Sheet {
  const pr = pc.profile
  const zBot = Math.min(...pc.bottom.z) - (pc.bottom.square ? 0 : 12)
  const zTop = Math.max(...pc.top.z) + (pc.top.square ? 0 : 12)
  const c = frame(pc, zTop)
  const P = pr.perimeter
  const w = Math.max(MX * 2 + P + opt.tab + 4, MIN_W)
  const h = c.yOf(zBot) + 10

  if (!pc.bottom.square) c.items.push({ t: 'waste', pts: wastePoly(c, pc.bottom.z, zBot) })
  if (!pc.top.square) c.items.push({ t: 'waste', pts: wastePoly(c, pc.top.z, zTop) })
  drawPaper(c, zTop, zBot, opt)
  drawQuadrants(c, zTop, zBot)
  for (const e of [pc.bottom, pc.top]) c.items.push({ t: 'poly', s: 'cut', pts: curvePts(c, e.z) })
  // lengths along quadrant lines
  for (const q of pr.quadrants) {
    const L = valueAt(pr, pc.top.z, q.p) - valueAt(pr, pc.bottom.z, q.p)
    const zm = (valueAt(pr, pc.top.z, q.p) + valueAt(pr, pc.bottom.z, q.p)) / 2
    c.items.push({ t: 'text', x: c.xOf(q.p) + 1.2, y: c.yOf(zm), text: `${fmt(L)} mm`, size: 2.8, rot: -90, anchor: 'middle' })
  }
  const title = `${pc.name} — cữ toàn chiều dài`
  titleBlock(c.items, title, pieceLines(pc), w, h)
  return {
    id: `${pc.id}-full`,
    pieceId: pc.id,
    title,
    subtitle: specLabel(pc.spec),
    qty: pc.qty,
    w,
    h,
    items: c.items,
    wrap: { x0: c.x0, y0: c.y0, P, zTop, zBottom: zBot },
    stations: {
      heading: 'Chiều dài ống tại vị trí',
      rows: stationRows(pr, (p) => valueAt(pr, pc.top.z, p) - valueAt(pr, pc.bottom.z, p), opt.stations),
    },
  }
}

function endSheet(pc: Piece, e: EndCut, opt: TemplateOptions): Sheet {
  const pr = pc.profile
  const zmin = Math.min(...e.z)
  const zmax = Math.max(...e.z)
  const bottom = e.side === 'bottom'
  // reference line sits on the material side of the cut
  const zRef = bottom ? zmax + opt.refGap : zmin - opt.refGap
  const zTop = bottom ? zRef + 8 : zmax + 12
  const zBot = bottom ? zmin - 12 : zRef - 8
  const c = frame(pc, zTop)
  const P = pr.perimeter
  const w = Math.max(MX * 2 + P + opt.tab + 4, MIN_W)
  const h = c.yOf(zBot) + 10

  c.items.push({ t: 'waste', pts: wastePoly(c, e.z, bottom ? zBot : zTop) })
  drawPaper(c, zTop, zBot, opt)
  drawQuadrants(c, zTop, zBot)
  c.items.push({ t: 'poly', s: 'ref', pts: [[c.xOf(0), c.yOf(zRef)], [c.xOf(P), c.yOf(zRef)]] })
  c.items.push({ t: 'text', x: c.xOf(P / 2 + P / 8), y: c.yOf(zRef) + (bottom ? -1.2 : 3.2), text: 'ĐƯỜNG CHUẨN (vuông góc trục ống)', size: 2.4, muted: true, anchor: 'middle' })
  c.items.push({ t: 'poly', s: 'cut', pts: curvePts(c, e.z) })
  for (const q of pr.quadrants) {
    const d = Math.abs(zRef - valueAt(pr, e.z, q.p))
    c.items.push({ t: 'text', x: c.xOf(q.p) + 1.2, y: (c.yOf(zRef) + c.yOf(valueAt(pr, e.z, q.p))) / 2, text: `${fmt(d)}`, size: 2.8, rot: -90, anchor: 'middle' })
  }
  const other = bottom ? pc.top : pc.bottom
  const lenNote = other.square
    ? `Từ đường chuẩn tới đầu vuông: ${fmt(Math.abs(other.z[0] - zRef))} mm (đo dọc vạch 0°)`
    : `Từ đường chuẩn tới đường chuẩn đầu kia (vạch 0°): ${fmt(Math.abs((bottom ? Math.min(...other.z) - opt.refGap : Math.max(...other.z) + opt.refGap) - zRef))} mm`
  const title = `${pc.name} — ${e.name}`
  titleBlock(c.items, title, [...pieceLines(pc).slice(0, 2), lenNote], w, h)
  return {
    id: `${pc.id}-${e.side}`,
    pieceId: pc.id,
    title,
    subtitle: specLabel(pc.spec),
    qty: pc.qty,
    w,
    h,
    items: c.items,
    wrap: { x0: c.x0, y0: c.y0, P, zTop, zBottom: zBot },
    stations: {
      heading: 'Khoảng cách đường chuẩn → đường cắt',
      rows: stationRows(pr, (p) => Math.abs(zRef - valueAt(pr, e.z, p)), opt.stations),
    },
  }
}

function holeSheet(hole: HoleCurve, header: Piece): Sheet {
  const xs = hole.pts.map((p) => p[0])
  const ys = hole.pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 20
  const w = Math.max(maxX - minX + pad * 2 + MX * 2, MIN_W)
  const cx = w / 2
  const oy = TITLE_H + 6 + pad
  const X = (x: number) => cx + (x - (minX + maxX) / 2)
  const Y = (y: number) => oy + (maxY - y)
  const h = Y(minY) + pad + 8
  const items: Item[] = []
  items.push({ t: 'poly', s: 'outline', closed: true, pts: [[MX, TITLE_H + 6], [w - MX, TITLE_H + 6], [w - MX, h - 8], [MX, h - 8]] })
  // centre lines: header top line (y=0) and the branch axis
  items.push({ t: 'poly', s: 'ref', pts: [[MX, Y(0)], [w - MX, Y(0)]] })
  items.push({ t: 'poly', s: 'ref', pts: [[X(hole.axisX), TITLE_H + 6], [X(hole.axisX), h - 8]] })
  items.push({ t: 'waste', pts: hole.pts.map(([x, y]) => [X(x), Y(y)] as [number, number]) })
  items.push({ t: 'poly', s: 'cut', closed: true, pts: hole.pts.map(([x, y]) => [X(x), Y(y)] as [number, number]) })
  items.push({ t: 'text', x: w - MX - 1, y: Y(0) - 1.2, text: hole.kind === 'round' ? 'Đường đỉnh ống chính' : 'Tâm mặt hộp', size: 2.4, anchor: 'end', muted: true })
  items.push({ t: 'text', x: X(hole.axisX) + 1.2, y: h - 10, text: 'Tâm ống nhánh', size: 2.4, muted: true })
  const title = 'Ống chính — lỗ khoét'
  titleBlock(
    items,
    title,
    [
      `${specLabel(header.spec)} · Lỗ theo mặt trong ống nhánh`,
      hole.kind === 'round' ? 'Quấn cữ lên ống chính: đường ngang trùng đường đỉnh ống.' : 'Đặt lên mặt hộp: đường ngang trùng tâm mặt.',
    ],
    w,
    h,
  )
  return {
    id: 'hole',
    pieceId: 'header',
    title,
    subtitle: specLabel(header.spec),
    qty: 1,
    w,
    h,
    items,
    stations: { heading: '', rows: [] },
  }
}
