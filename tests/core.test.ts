import { describe, expect, it } from 'vitest'
import { buildAssembly } from '../src/core/joint'
import { defaultConfig, rect, round } from '../src/core/presets'
import { buildProfile, valueAt } from '../src/core/profile'
import { buildSheets } from '../src/core/template'

const at = (pr: ReturnType<typeof buildProfile>, z: number[], deg: number) => valueAt(pr, z, (pr.perimeter * deg) / 360)

describe('profile', () => {
  it('round perimeter = pi * OD', () => {
    expect(buildProfile(round(42.2)).perimeter).toBeCloseTo(Math.PI * 42.2, 6)
  })
  it('rect perimeter accounts for corner radius', () => {
    const s = rect(40, 20, 2)
    const pr = buildProfile(s)
    expect(pr.perimeter).toBeCloseTo(2 * (40 + 20) - 8 * s.rc + 2 * Math.PI * s.rc, 6)
    expect(pr.folds.length).toBe(4)
    expect(pr.quadrants.map((q) => q.label)).toEqual(['0°', '90°', '180°', '270°'])
  })
})

describe('saddle round-round', () => {
  const cfg = { ...defaultConfig(), fit: 'outer' as const }
  const asm = buildAssembly(cfg)
  const br = asm.pieces[1]
  const R = cfg.header.od / 2
  const r = cfg.branch.od / 2
  it('T joint: crown touches top of header at 0/180 deg, sides wrap at 90/270', () => {
    expect(at(br.profile, br.bottom.z, 0)).toBeCloseTo(R, 3)
    expect(at(br.profile, br.bottom.z, 180)).toBeCloseTo(R, 3)
    expect(at(br.profile, br.bottom.z, 90)).toBeCloseTo(Math.sqrt(R * R - r * r), 3)
  })
  it('every outer cut point lies on the header outer cylinder', () => {
    const { u, v, w, o } = br.frame
    br.profile.outer.forEach((p, i) => {
      const z = br.bottom.z[i]
      const Y = o[1] + z * u[1] + p.a * v[1] + p.b * w[1]
      const Z = o[2] + z * u[2] + p.a * v[2] + p.b * w[2]
      expect(Math.hypot(Y, Z)).toBeCloseTo(R, 6)
    })
  })
  it('angled Y joint with offset still lands on the header', () => {
    const c2 = { ...cfg, angle: 45, offset: 8 }
    const b2 = buildAssembly(c2).pieces[1]
    const { u, v, w, o } = b2.frame
    b2.profile.outer.forEach((p, i) => {
      const z = b2.bottom.z[i]
      const Y = o[1] + z * u[1] + p.a * v[1] + p.b * w[1]
      const Z = o[2] + z * u[2] + p.a * v[2] + p.b * w[2]
      expect(Math.hypot(Y, Z)).toBeCloseTo(R, 6)
    })
  })
  it('safe fit removes at least as much as outer/inner everywhere', () => {
    const safe = buildAssembly({ ...cfg, fit: 'safe' }).pieces[1].bottom.z
    const inner = buildAssembly({ ...cfg, fit: 'inner' }).pieces[1].bottom.z
    safe.forEach((z, i) => {
      expect(z).toBeGreaterThanOrEqual(br.bottom.z[i] - 1e-9)
      expect(z).toBeGreaterThanOrEqual(inner[i] - 1e-9)
    })
  })
  it('branch longest length equals branchLen', () => {
    expect(br.top.z[0] - Math.min(...br.bottom.z)).toBeCloseTo(cfg.branchLen, 6)
  })
  it('warns when branch is larger than header', () => {
    const a = buildAssembly({ ...cfg, branch: round(76) })
    expect(a.warnings.length).toBeGreaterThan(0)
  })
})

describe('saddle on flat face', () => {
  it('round branch at 60deg onto a box: straight sine cut, span = D / tan(60)', () => {
    const cfg = { ...defaultConfig(), branch: round(33.5), header: rect(50, 50), angle: 60, fit: 'outer' as const }
    const b = buildAssembly(cfg).pieces[1]
    const span = Math.max(...b.bottom.z) - Math.min(...b.bottom.z)
    expect(span).toBeCloseTo(33.5 / Math.tan((60 * Math.PI) / 180), 4)
  })
})

describe('elbow', () => {
  it('90deg two-piece miter: 45deg cut, extrados longer by OD', () => {
    const cfg = { ...defaultConfig(), type: 'elbow' as const, segments: 2, elbowAngle: 90, tail: 100, fit: 'outer' as const }
    const asm = buildAssembly(cfg)
    const p0 = asm.pieces[0]
    expect(at(p0.profile, p0.top.z, 0)).toBeCloseTo(100 + 21.1, 4)
    expect(at(p0.profile, p0.top.z, 180)).toBeCloseTo(100 - 21.1, 4)
    expect(asm.pieces.filter((p) => p.templated).length).toBe(1)
  })
  it('lobster: pieces chain end to end and total turn equals the elbow angle', () => {
    const cfg = { ...defaultConfig(), type: 'elbow' as const, segments: 5, elbowAngle: 90, bendRadius: 80, tail: 50 }
    const asm = buildAssembly(cfg)
    expect(asm.pieces.length).toBe(5)
    const first = asm.pieces[0].frame.u
    const last = asm.pieces[4].frame.u
    const dot = first[0] * last[0] + first[1] * last[1] + first[2] * last[2]
    expect(dot).toBeCloseTo(0, 6)
    expect(asm.warnings).toEqual([])
    // middle piece centre length = 2 R tan(gamma)
    const mid = asm.pieces[1]
    const g = (90 / 4 / 2) * (Math.PI / 180)
    expect(at(mid.profile, mid.top.z, 90) - at(mid.profile, mid.bottom.z, 90)).toBeCloseTo(2 * 80 * Math.tan(g), 4)
  })
})

describe('sheets', () => {
  it('builds sheets with finite geometry for every preset combination', () => {
    const variants = [
      defaultConfig(),
      { ...defaultConfig(), hole: true },
      { ...defaultConfig(), header: rect(40, 80), branch: rect(30, 30), angle: 35, hole: true },
      { ...defaultConfig(), header: round(59.9), branch: rect(30, 20), angle: 70, offset: 5 },
      { ...defaultConfig(), type: 'elbow' as const, segments: 4, bendRadius: 90, branch: rect(40, 40) },
      { ...defaultConfig(), branchLen: 600 },
    ]
    for (const v of variants) {
      const sheets = buildSheets(buildAssembly(v))
      expect(sheets.length).toBeGreaterThan(0)
      for (const s of sheets) {
        expect(Number.isFinite(s.w) && Number.isFinite(s.h)).toBe(true)
        for (const it of s.items) {
          if (it.t === 'text') continue
          for (const [x, y] of it.pts) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
        }
      }
    }
  })
  it('long branch splits into an end template', () => {
    const sheets = buildSheets(buildAssembly({ ...defaultConfig(), branchLen: 600 }))
    expect(sheets.map((s) => s.id)).toEqual(['branch-bottom'])
  })
})

describe('exports', () => {
  it('SVG is sized in real millimetres and DXF is well formed', async () => {
    const { sheetToSvg } = await import('../src/render/svg')
    const { sheetToDxf } = await import('../src/render/dxf')
    const [s] = buildSheets(buildAssembly(defaultConfig()))
    const svg = sheetToSvg(s, { standalone: true })
    expect(svg).toContain(`width="${Math.round(s.w * 1000) / 1000}mm"`)
    expect(svg).toContain(`viewBox="0 0 ${Math.round(s.w * 1000) / 1000} ${Math.round(s.h * 1000) / 1000}"`)
    const dxf = sheetToDxf(s).split('\n')
    expect(dxf[dxf.length - 1]).toBe('EOF')
    expect(dxf.length % 2).toBe(0)
    expect(dxf.filter((l) => l === 'POLYLINE').length).toBe(dxf.filter((l) => l === 'SEQEND').length)
  })
  it('hole template marks where the branch axis pierces the header', () => {
    const asm = buildAssembly({ ...defaultConfig(), angle: 60, hole: true })
    const R = defaultConfig().header.od / 2
    expect(asm.hole!.axisX).toBeCloseTo(R / Math.tan(Math.PI / 3), 6)
  })
})
