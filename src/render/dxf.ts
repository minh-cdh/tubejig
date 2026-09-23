import type { Sheet, Stroke } from '../core/template'

const LAYER: Record<Stroke | 'WASTE' | 'TEXT', string> = {
  cut: 'CUT',
  outline: 'OUTLINE',
  ref: 'REFERENCE',
  fold: 'FOLD',
  tick: 'TICKS',
  tab: 'TAB',
  quad: 'QUADRANT',
  WASTE: 'WASTE',
  TEXT: 'TEXT',
}
const COLOR: Record<string, number> = { CUT: 7, OUTLINE: 8, REFERENCE: 5, FOLD: 9, TICKS: 8, TAB: 8, QUADRANT: 30, TEXT: 7 }

const ascii = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '')

/** Minimal AutoCAD R12 DXF in millimetres (Y up). */
export function sheetToDxf(sheet: Sheet): string {
  const out: string[] = []
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === 'number' ? (Math.round(v * 1e4) / 1e4).toString() : v)
  const Y = (y: number) => sheet.h - y
  g(0, 'SECTION'); g(2, 'HEADER')
  g(9, '$ACADVER'); g(1, 'AC1009')
  g(9, '$INSUNITS'); g(70, 4)
  g(9, '$EXTMIN'); g(10, 0); g(20, 0)
  g(9, '$EXTMAX'); g(10, sheet.w); g(20, sheet.h)
  g(0, 'ENDSEC')
  g(0, 'SECTION'); g(2, 'TABLES')
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(COLOR).length)
  for (const [name, col] of Object.entries(COLOR)) {
    g(0, 'LAYER'); g(2, name); g(70, 0); g(62, col); g(6, 'CONTINUOUS')
  }
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')
  g(0, 'SECTION'); g(2, 'ENTITIES')
  for (const it of sheet.items) {
    if (it.t === 'text') {
      g(0, 'TEXT'); g(8, LAYER.TEXT)
      g(10, it.x); g(20, Y(it.y)); g(30, 0)
      g(40, it.size * 0.72)
      g(1, ascii(it.text))
      if (it.rot) g(50, -it.rot)
      continue
    }
    if (it.t === 'waste') continue
    g(0, 'POLYLINE'); g(8, LAYER[it.s]); g(66, 1); g(70, it.closed ? 1 : 0)
    for (const [x, y] of it.pts) {
      g(0, 'VERTEX'); g(8, LAYER[it.s]); g(10, x); g(20, Y(y)); g(30, 0)
    }
    g(0, 'SEQEND')
  }
  g(0, 'ENDSEC')
  g(0, 'EOF')
  return out.join('\n')
}
