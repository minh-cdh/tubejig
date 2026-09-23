import type { Sheet } from '../core/template'
import { FONT, STROKES, TEXT, TEXT_MUTED, WASTE_FILL } from './style'

const n = (x: number) => (Math.round(x * 1000) / 1000).toString()

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** SVG markup of a sheet in true millimetres. */
export function sheetToSvg(sheet: Sheet, opts: { standalone?: boolean; paper?: boolean } = {}): string {
  const parts: string[] = []
  const pid = `h-${sheet.id}`
  parts.push(
    `<defs><pattern id="${pid}" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="${WASTE_FILL}"/><line x1="0" y1="0" x2="0" y2="3" stroke="#9a9a9a" stroke-width="0.35"/></pattern></defs>`,
  )
  if (opts.paper !== false) parts.push(`<rect x="0" y="0" width="${n(sheet.w)}" height="${n(sheet.h)}" fill="#ffffff"/>`)
  for (const it of sheet.items) {
    if (it.t === 'waste') {
      parts.push(`<polygon points="${it.pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="url(#${pid})" stroke="none"/>`)
    } else if (it.t === 'poly') {
      const st = STROKES[it.s]
      const tag = it.closed ? 'polygon' : 'polyline'
      parts.push(
        `<${tag} points="${it.pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}" fill="none" stroke="${st.c}" stroke-width="${st.w}" stroke-linejoin="round" stroke-linecap="round"${st.dash ? ` stroke-dasharray="${st.dash.join(' ')}"` : ''}/>`,
      )
    } else {
      const anchor = it.anchor ?? 'start'
      const tr = it.rot ? ` transform="rotate(${it.rot} ${n(it.x)} ${n(it.y)})"` : ''
      parts.push(
        `<text x="${n(it.x)}" y="${n(it.y)}" font-size="${it.size}" font-family="${FONT.replace(/"/g, "'")}" font-weight="${it.bold ? 600 : 400}" fill="${it.muted ? TEXT_MUTED : TEXT}" text-anchor="${anchor}" dominant-baseline="${it.rot ? 'hanging' : 'alphabetic'}"${tr}>${esc(it.text)}</text>`,
      )
    }
  }
  const body = parts.join('\n')
  const head = opts.standalone ? '<?xml version="1.0" encoding="UTF-8"?>\n' : ''
  return `${head}<svg xmlns="http://www.w3.org/2000/svg" width="${n(sheet.w)}mm" height="${n(sheet.h)}mm" viewBox="0 0 ${n(sheet.w)} ${n(sheet.h)}">\n${body}\n</svg>`
}
