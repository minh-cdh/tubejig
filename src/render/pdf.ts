import { jsPDF } from 'jspdf'
import type { Item, Sheet } from '../core/template'
import { fmt } from '../core/profile'
import { STROKES, TEXT, TEXT_MUTED, WASTE_FILL } from './style'

export type PaperSize = 'A4' | 'A3' | 'A2' | 'Letter'
export const PAPERS: Record<PaperSize, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  Letter: [215.9, 279.4],
}

export interface PdfOptions {
  paper: PaperSize
  margin: number
  overlap: number
  includeTable: boolean
}

const PT_PER_MM = 72 / 25.4
const FONT = 'BeVietnam'
let fontCache: { regular: string; bold: string } | null | undefined

async function loadFonts(): Promise<{ regular: string; bold: string } | null> {
  if (fontCache !== undefined) return fontCache
  try {
    const base = import.meta.env.BASE_URL
    const get = async (f: string) => {
      const r = await fetch(`${base}fonts/${f}`)
      if (!r.ok) throw new Error(String(r.status))
      const buf = new Uint8Array(await r.arrayBuffer())
      let s = ''
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(s)
    }
    fontCache = { regular: await get('BeVietnamPro-Regular.ttf'), bold: await get('BeVietnamPro-SemiBold.ttf') }
  } catch {
    fontCache = null
  }
  return fontCache
}

const stripVi = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')

function hex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

class Pen {
  doc: jsPDF
  unicode: boolean
  constructor(doc: jsPDF, unicode: boolean) {
    this.doc = doc
    this.unicode = unicode
  }
  font(bold: boolean) {
    if (this.unicode) this.doc.setFont(FONT, bold ? 'bold' : 'normal')
    else this.doc.setFont('helvetica', bold ? 'bold' : 'normal')
  }
  t(s: string) {
    return this.unicode ? s : stripVi(s)
  }
  path(pts: [number, number][], dx: number, dy: number, style: 'S' | 'F' | null, closed: boolean) {
    const [x0, y0] = pts[0]
    const d: [number, number][] = []
    for (let i = 1; i < pts.length; i++) d.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]])
    this.doc.lines(d, x0 + dx, y0 + dy, [1, 1], style as 'S', closed)
  }
  text(it: Extract<Item, { t: 'text' }>, dx: number, dy: number) {
    const doc = this.doc
    this.font(!!it.bold)
    doc.setFontSize(it.size * PT_PER_MM)
    doc.setTextColor(...hex(it.muted ? TEXT_MUTED : TEXT))
    const s = this.t(it.text)
    const width = doc.getTextWidth(s)
    const rot = ((it.rot ?? 0) * Math.PI) / 180
    const dir = [Math.cos(rot), Math.sin(rot)]
    const down = [-dir[1], dir[0]]
    const off = it.anchor === 'middle' ? width / 2 : it.anchor === 'end' ? width : 0
    const asc = it.rot ? it.size * 0.78 : 0
    const x = it.x + dx - dir[0] * off + down[0] * asc
    const y = it.y + dy - dir[1] * off + down[1] * asc
    doc.text(s, x, y, { angle: -(it.rot ?? 0) })
  }
}

function drawItems(pen: Pen, items: Item[], dx: number, dy: number) {
  const doc = pen.doc
  for (const it of items) {
    if (it.t === 'waste') {
      doc.setFillColor(...hex(WASTE_FILL))
      pen.path(it.pts, dx, dy, 'F', true)
      // diagonal hatch clipped to the waste region
      const xs = it.pts.map((p) => p[0] + dx)
      const ys = it.pts.map((p) => p[1] + dy)
      const x0 = Math.min(...xs)
      const x1 = Math.max(...xs)
      const y0 = Math.min(...ys)
      const y1 = Math.max(...ys)
      doc.saveGraphicsState()
      pen.path(it.pts, dx, dy, null, true)
      doc.clip()
      doc.discardPath()
      doc.setDrawColor(150, 150, 150)
      doc.setLineWidth(0.2)
      doc.setLineDashPattern([], 0)
      for (let k = x0 - (y1 - y0); k < x1; k += 3) doc.line(k, y1, k + (y1 - y0), y0)
      doc.restoreGraphicsState()
    } else if (it.t === 'poly') {
      const st = STROKES[it.s]
      doc.setDrawColor(...hex(st.c))
      doc.setLineWidth(st.w)
      doc.setLineDashPattern(st.dash ?? [], 0)
      pen.path(it.pts, dx, dy, 'S', !!it.closed)
    } else {
      pen.text(it, dx, dy)
    }
  }
  doc.setLineDashPattern([], 0)
}

interface Layout {
  orient: 'p' | 'l'
  pw: number
  ph: number
  cols: number
  rows: number
}

function layout(sheet: Sheet, o: PdfOptions): Layout {
  const [a, b] = PAPERS[o.paper]
  const cand = (['p', 'l'] as const).map((orient) => {
    const [W, H] = orient === 'p' ? [a, b] : [b, a]
    const pw = W - 2 * o.margin
    const ph = H - 2 * o.margin - 6
    const cols = sheet.w <= pw ? 1 : Math.ceil((sheet.w - o.overlap) / (pw - o.overlap))
    const rows = sheet.h <= ph ? 1 : Math.ceil((sheet.h - o.overlap) / (ph - o.overlap))
    return { orient, pw, ph, cols, rows }
  })
  cand.sort((x, y) => x.cols * x.rows - y.cols * y.rows || (sheet.w > sheet.h ? (x.orient === 'l' ? -1 : 1) : x.orient === 'p' ? -1 : 1))
  return cand[0]
}

function cross(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.2)
  doc.setLineDashPattern([], 0)
  doc.line(x - 3, y, x + 3, y)
  doc.line(x, y - 3, x, y + 3)
  doc.circle(x, y, 1.5, 'S')
}

export async function sheetsToPdf(sheets: Sheet[], o: PdfOptions, projectTitle: string): Promise<jsPDF> {
  const fonts = await loadFonts()
  const [pa, pb] = PAPERS[o.paper]
  const firstOrient = sheets.length ? layout(sheets[0], o).orient : 'p'
  const doc = new jsPDF({ unit: 'mm', format: [pa, pb], orientation: firstOrient, compress: true })
  if (fonts) {
    doc.addFileToVFS('bvp-r.ttf', fonts.regular)
    doc.addFont('bvp-r.ttf', FONT, 'normal')
    doc.addFileToVFS('bvp-b.ttf', fonts.bold)
    doc.addFont('bvp-b.ttf', FONT, 'bold')
  }
  const pen = new Pen(doc, !!fonts)
  doc.setProperties({ title: projectTitle, creator: 'TubeJig' })
  let first = true
  const totalPages = sheets.reduce((s, sh) => {
    const L = layout(sh, o)
    return s + L.cols * L.rows
  }, 0)
  let pageNo = 0

  for (const sh of sheets) {
    const L = layout(sh, o)
    const [PW, PH] = L.orient === 'p' ? [pa, pb] : [pb, pa]
    const stepX = L.pw - o.overlap
    const stepY = L.ph - o.overlap
    // centre single-page sheets
    const cx = L.cols === 1 ? (L.pw - sh.w) / 2 : 0
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < L.cols; c++) {
        if (first) first = false
        else doc.addPage([pa, pb], L.orient)
        pageNo++
        const ox = c * stepX
        const oy = r * stepY
        const dx = o.margin - ox + cx
        const dy = o.margin - oy
        doc.saveGraphicsState()
        doc.rect(o.margin, o.margin, L.pw, L.ph, null)
        doc.clip()
        doc.discardPath()
        drawItems(pen, sh.items, dx, dy)
        // registration crosses on internal seams (appear on both neighbouring pages)
        for (let k = 1; k < L.cols; k++) {
          const sx = k * stepX + o.overlap / 2
          for (let yy = 30; yy < sh.h; yy += 45) cross(doc, sx + dx, yy + dy)
        }
        for (let k = 1; k < L.rows; k++) {
          const sy = k * stepY + o.overlap / 2
          for (let xx = 30; xx < sh.w; xx += 45) cross(doc, xx + dx, sy + dy)
        }
        doc.restoreGraphicsState()
        // overlap guides
        doc.setDrawColor(120, 120, 120)
        doc.setLineWidth(0.15)
        doc.setLineDashPattern([1, 1], 0)
        if (c > 0) doc.line(o.margin + o.overlap, o.margin, o.margin + o.overlap, o.margin + L.ph)
        if (r > 0) doc.line(o.margin, o.margin + o.overlap, o.margin + L.pw, o.margin + o.overlap)
        doc.setLineDashPattern([], 0)
        // footer
        pen.font(false)
        doc.setFontSize(7)
        doc.setTextColor(90, 90, 90)
        const tile = L.cols * L.rows > 1 ? ` · Mảnh ${r + 1}-${c + 1} (hàng-cột) / ${L.rows}×${L.cols} — chồng ${o.overlap} mm, khớp dấu chữ thập` : ''
        doc.text(pen.t(`${sh.title}${tile}`), o.margin, PH - o.margin + 2)
        doc.text(pen.t(`Trang ${pageNo}/${totalPages + (o.includeTable ? 1 : 0)} · In 100% (Actual size), không "Fit to page"`), PW - o.margin, PH - o.margin + 2, { align: 'right' })
        // 20 mm scale check on every page
        const sx = PW - o.margin - 20
        const sy = PH - o.margin + 4.5
        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(0.3)
        doc.line(sx, sy, sx + 20, sy)
        doc.line(sx, sy - 1.2, sx, sy + 1.2)
        doc.line(sx + 20, sy - 1.2, sx + 20, sy + 1.2)
        doc.text('20 mm', sx - 1.5, sy + 0.9, { align: 'right' })
      }
    }
  }

  if (o.includeTable) {
    if (first) first = false
    else doc.addPage([pa, pb], 'p')
    const PW = pa
    pen.font(true)
    doc.setFontSize(13)
    doc.setTextColor(0, 0, 0)
    let y = o.margin + 6
    doc.text(pen.t(`${projectTitle} — Bảng tọa độ vạch dấu`), o.margin, y)
    y += 5
    pen.font(false)
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text(pen.t('Dùng khi không in được cữ: chia chu vi ống thành các vạch, đo theo trục ống các giá trị bên dưới.'), o.margin, y)
    y += 7
    const colW = (PW - 2 * o.margin) / 2
    let col = 0
    let yStart = y
    for (const sh of sheets) {
      if (!sh.stations.rows.length) continue
      const need = 10 + sh.stations.rows.length * 4.4
      if (yStart + need > pb - o.margin - 10) {
        if (col === 0) {
          col = 1
          yStart = y
        } else {
          doc.addPage([pa, pb], 'p')
          col = 0
          y = o.margin + 6
          yStart = y
        }
      }
      const x = o.margin + col * colW
      let yy = yStart
      pen.font(true)
      doc.setFontSize(9)
      doc.setTextColor(0, 0, 0)
      doc.text(pen.t(sh.title), x, yy)
      yy += 4.5
      pen.font(false)
      doc.setFontSize(7.5)
      doc.setTextColor(90, 90, 90)
      doc.text(pen.t(sh.stations.heading), x, yy)
      yy += 4.5
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(8.5)
      sh.stations.rows.forEach((row, i) => {
        if (i % 2 === 0) {
          doc.setFillColor(242, 242, 242)
          doc.rect(x - 1, yy - 3.2, colW - 8, 4.4, 'F')
        }
        doc.text(pen.t(row.label), x, yy)
        doc.text(`${fmt(row.value)} mm`, x + colW - 12, yy, { align: 'right' })
        yy += 4.4
      })
      yStart = yy + 6
    }
  }
  return doc
}
