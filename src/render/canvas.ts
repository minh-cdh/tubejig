import type { Sheet } from '../core/template'
import { FONT, STROKES, TEXT, TEXT_MUTED, WASTE_FILL } from './style'

/**
 * Rasterise the wrap region of a sheet (paper that goes around the tube) for the 3D preview.
 * Returns a canvas whose x spans [x0, x0+P] and y spans the paper height.
 */
export function wrapCanvas(sheet: Sheet, pxPerMm = 6): HTMLCanvasElement | null {
  const wr = sheet.wrap
  if (!wr) return null
  const Wmm = wr.P
  const Hmm = wr.zTop - wr.zBottom
  const scale = Math.min(pxPerMm, 4096 / Wmm, 4096 / Hmm)
  const cv = document.createElement('canvas')
  cv.width = Math.max(2, Math.round(Wmm * scale))
  cv.height = Math.max(2, Math.round(Hmm * scale))
  const g = cv.getContext('2d')!
  g.fillStyle = '#fbfaf5'
  g.fillRect(0, 0, cv.width, cv.height)
  g.scale(scale, scale)
  g.translate(-wr.x0, -wr.y0)
  g.lineJoin = 'round'
  g.lineCap = 'round'

  const hatch = document.createElement('canvas')
  hatch.width = hatch.height = 12
  const hg = hatch.getContext('2d')!
  hg.fillStyle = WASTE_FILL
  hg.fillRect(0, 0, 12, 12)
  hg.strokeStyle = '#8f8f8f'
  hg.lineWidth = 1.5
  hg.beginPath()
  hg.moveTo(0, 12)
  hg.lineTo(12, 0)
  hg.stroke()
  const pat = g.createPattern(hatch, 'repeat')!
  pat.setTransform(new DOMMatrix().scale(0.25))

  for (const it of sheet.items) {
    if (it.t === 'waste') {
      g.beginPath()
      it.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.closePath()
      g.fillStyle = pat
      g.fill()
    } else if (it.t === 'poly') {
      const st = STROKES[it.s]
      g.strokeStyle = it.s === 'cut' ? '#b91c1c' : st.c
      g.lineWidth = it.s === 'cut' ? 0.9 : Math.max(st.w, 0.3)
      g.setLineDash(st.dash ?? [])
      g.beginPath()
      it.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      if (it.closed) g.closePath()
      g.stroke()
    } else {
      g.save()
      g.translate(it.x, it.y)
      if (it.rot) g.rotate((it.rot * Math.PI) / 180)
      g.font = `${it.bold ? 600 : 400} ${it.size}px ${FONT}`
      g.fillStyle = it.muted ? TEXT_MUTED : TEXT
      g.textAlign = it.anchor === 'middle' ? 'center' : it.anchor === 'end' ? 'right' : 'left'
      g.textBaseline = it.rot ? 'top' : 'alphabetic'
      g.fillText(it.text, 0, 0)
      g.restore()
    }
  }
  return cv
}
