import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Assembly, Piece } from '../core/joint'
import { toWorld } from '../core/joint'
import { profileAt } from '../core/profile'
import type { Sheet } from '../core/template'
import { wrapCanvas } from './canvas'

const PIECE_COLORS: Record<Piece['role'], number> = { header: 0x8a929c, branch: 0xb8c4d2, segment: 0xa9b6c4 }

interface PieceMats {
  metal: THREE.MeshStandardMaterial
  inner: THREE.MeshStandardMaterial
  cut: THREE.MeshStandardMaterial
  xray: boolean
}

const LINE_MATS = {
  seam0: new THREE.LineBasicMaterial({ color: 0xff3b30 }),
  seam90: new THREE.LineBasicMaterial({ color: 0xffb020 }),
  edge: new THREE.LineBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 0.6 }),
}

export interface ViewOptions {
  xray: boolean
  seams: boolean
  wrap: number // 0..1
  wrapSheet: Sheet | null
}

export class TubeScene {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  root = new THREE.Group()
  paper: THREE.Mesh | null = null
  meshes = new Map<string, THREE.Group>()
  selected = ''
  hovered = ''
  onPick: (id: string) => void = () => {}
  private el: HTMLElement
  private ro: ResizeObserver
  private raf = 0
  private ray = new THREE.Raycaster()
  private asm: Assembly | null = null
  private ground: THREE.Mesh
  private grid: THREE.GridHelper
  private down = { x: 0, y: 0 }

  constructor(el: HTMLElement) {
    this.el = el
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    el.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x0d1117)
    this.scene.fog = new THREE.Fog(0x0d1117, 900, 2600)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 8000)
    this.camera.position.set(260, 220, 340)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08

    const key = new THREE.DirectionalLight(0xfff4e6, 2.2)
    key.position.set(300, 600, 250)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const sc = key.shadow.camera as THREE.OrthographicCamera
    sc.left = sc.bottom = -600
    sc.right = sc.top = 600
    sc.near = 10
    sc.far = 2000
    key.shadow.bias = -0.0002
    key.shadow.normalBias = 1.2
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x7fb4ff, 0.9)
    rim.position.set(-400, 200, -300)
    this.scene.add(rim)
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1410, 0.35))

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShadowMaterial({ opacity: 0.35 }))
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.scene.add(this.ground)
    this.grid = new THREE.GridHelper(2000, 100, 0x2a3442, 0x1a212c)
    ;(this.grid.material as THREE.Material).transparent = true
    ;(this.grid.material as THREE.Material).opacity = 0.7
    this.scene.add(this.grid)
    this.scene.add(this.root)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(el)
    this.resize()
    const cv = this.renderer.domElement
    cv.addEventListener('pointermove', this.onMove)
    cv.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }))
    cv.addEventListener('pointerup', this.onUp)
    this.loop()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.clear()
    for (const m of this.mats.values()) [m.metal, m.inner, m.cut].forEach((x) => x.dispose())
    this.paperTex?.dispose()
    if (this.paper) {
      this.paper.geometry.dispose()
      ;(this.paper.material as THREE.Material).dispose()
    }
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private resize() {
    const w = this.el.clientWidth || 1
    const h = this.el.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    this.controls.update()
    if (this.root.position.distanceToSquared(this.targetPos) > 1e-4) this.root.position.lerp(this.targetPos, 0.25)
    this.renderer.render(this.scene, this.camera)
  }

  private pick(e: PointerEvent): string {
    const r = this.renderer.domElement.getBoundingClientRect()
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(p, this.camera)
    const hits = this.ray.intersectObjects([...this.meshes.values()], true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o && !o.userData.pieceId) o = o.parent
      if (o) return o.userData.pieceId as string
    }
    return ''
  }

  private onMove = (e: PointerEvent) => {
    if (e.buttons) return
    const id = this.pick(e)
    if (id !== this.hovered) {
      this.hovered = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : ''
      this.applyHighlight()
    }
  }

  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 4) return
    const id = this.pick(e)
    if (id) this.onPick(id)
  }

  /** Drop piece geometries only; materials and the paper mesh are reused across rebuilds. */
  private clear() {
    if (this.paper) this.paper.parent?.remove(this.paper)
    this.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
    })
    this.root.clear()
    this.meshes.clear()
  }

  private mats = new Map<string, PieceMats>()

  private matsFor(pc: Piece, xray: boolean): PieceMats {
    let m = this.mats.get(pc.id)
    if (!m) {
      m = {
        metal: new THREE.MeshStandardMaterial({ color: PIECE_COLORS[pc.role], metalness: 0.85, roughness: 0.38 }),
        inner: new THREE.MeshStandardMaterial({ color: 0x3b4450, metalness: 0.6, roughness: 0.6 }),
        cut: new THREE.MeshStandardMaterial({ color: 0xf2e6d0, metalness: 0.9, roughness: 0.22, side: THREE.DoubleSide }),
        xray: !xray,
      }
      this.mats.set(pc.id, m)
    }
    m.metal.color.setHex(PIECE_COLORS[pc.role])
    if (m.xray !== xray) {
      // switching transparency needs a program change: only when the toggle actually flips
      m.xray = xray
      m.metal.transparent = xray
      m.metal.opacity = xray ? 0.35 : 1
      m.metal.depthWrite = !xray
      m.metal.side = xray ? THREE.DoubleSide : THREE.FrontSide
      m.inner.transparent = xray
      m.inner.opacity = xray ? 0.25 : 1
      m.metal.needsUpdate = m.inner.needsUpdate = true
    }
    return m
  }

  private targetPos = new THREE.Vector3()

  setAssembly(asm: Assembly, view: ViewOptions, refit: boolean) {
    this.clear()
    this.asm = asm
    const ids = new Set(asm.pieces.map((p) => p.id))
    for (const [id, m] of this.mats) {
      if (ids.has(id)) continue
      m.metal.dispose()
      m.inner.dispose()
      m.cut.dispose()
      this.mats.delete(id)
    }
    for (const pc of asm.pieces) {
      const g = buildPieceMesh(pc, view, this.matsFor(pc, view.xray), LINE_MATS)
      g.userData.pieceId = pc.id
      this.meshes.set(pc.id, g)
      this.root.add(g)
    }
    // sit the assembly on the floor; glide there instead of jumping while parameters change
    const box = new THREE.Box3().setFromObject(this.root)
    this.targetPos.set(-(box.min.x + box.max.x) / 2, -box.min.y + 0.5, -(box.min.z + box.max.z) / 2)
    if (refit) this.root.position.copy(this.targetPos)
    this.applyHighlight()
    if (refit) this.fit()
  }

  setSelected(id: string) {
    this.selected = id
    this.applyHighlight()
  }

  private applyHighlight() {
    for (const [id, g] of this.meshes) {
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
        if (!m || !('emissive' in m) || o.userData.noHighlight) return
        const on = id === this.selected ? 0.16 : id === this.hovered ? 0.08 : 0
        m.emissive.setHex(0xff8a1f)
        m.emissiveIntensity = on
      })
    }
  }

  private paperSheet: Sheet | null = null
  private paperTex: THREE.CanvasTexture | null = null

  updatePaper(view: ViewOptions) {
    const sh = view.wrapSheet
    const pc = sh && this.asm?.pieces.find((p) => p.id === sh.pieceId)
    const g = pc && this.meshes.get(pc.id)
    if (!sh || !sh.wrap || !pc || !g) {
      if (this.paper) this.paper.parent?.remove(this.paper)
      return
    }
    if (!this.paper) {
      const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 })
      this.paper = new THREE.Mesh(new THREE.BufferGeometry(), mat)
      this.paper.userData.noHighlight = true
      this.paper.castShadow = true
    }
    if (sh !== this.paperSheet) {
      const cv = wrapCanvas(sh)
      if (!cv) return
      const mat = this.paper.material as THREE.MeshStandardMaterial
      const old = this.paperTex
      if (old && old.image.width === cv.width && old.image.height === cv.height) {
        // same size: copy pixels into the existing texture (no new GPU allocation)
        ;(old.image as HTMLCanvasElement).getContext('2d')!.drawImage(cv, 0, 0)
        old.needsUpdate = true
      } else {
        old?.dispose()
        const tex = new THREE.CanvasTexture(cv)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        this.paperTex = tex
        mat.map = tex
        mat.needsUpdate = true
      }
      this.paperSheet = sh
    }
    this.paper.geometry.dispose()
    this.paper.geometry = paperGeometry(pc, sh, view.wrap)
    if (this.paper.parent !== g) g.add(this.paper)
  }

  fit(dir?: THREE.Vector3) {
    const box = new THREE.Box3().setFromObject(this.root)
    if (box.isEmpty()) return
    const c = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3()).length()
    const d = dir ?? this.camera.position.clone().sub(this.controls.target).normalize()
    const dist = size / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) * 1.05
    this.controls.target.copy(c)
    this.camera.position.copy(c).add(d.multiplyScalar(dist))
    this.camera.near = Math.max(dist / 100, 0.5)
    this.camera.far = dist * 20
    this.camera.updateProjectionMatrix()
  }

  view(name: 'iso' | 'front' | 'top' | 'side') {
    const dirs = {
      iso: new THREE.Vector3(0.55, 0.5, 0.68),
      front: new THREE.Vector3(0, 0.02, 1),
      top: new THREE.Vector3(0, 1, 0.001),
      side: new THREE.Vector3(1, 0.02, 0),
    }
    this.fit(dirs[name].normalize())
  }

  snapshot(): string {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }
}

function v3(a: [number, number, number]) {
  return new THREE.Vector3(a[0], a[1], a[2])
}

function buildPieceMesh(pc: Piece, view: ViewOptions, mats: PieceMats, lines: typeof LINE_MATS): THREE.Group {
  const g = new THREE.Group()
  const f = pc.frame
  const pr = pc.profile
  const N = pr.outer.length
  const z0 = pc.bottom.z
  const z1 = pc.top.z
  const vv = v3(f.v)
  const ww = v3(f.w)

  const wall = (pts: typeof pr.outer, flip: boolean) => {
    const pos = new Float32Array(N * 2 * 3)
    const nor = new Float32Array(N * 2 * 3)
    const idx: number[] = []
    for (let i = 0; i < N; i++) {
      const p = pts[i]
      const A = toWorld(f, p.a, p.b, z0[i])
      const B = toWorld(f, p.a, p.b, z1[i])
      pos.set(A, i * 6)
      pos.set(B, i * 6 + 3)
      const n = vv.clone().multiplyScalar(p.na).add(ww.clone().multiplyScalar(p.nb))
      if (flip) n.negate()
      nor.set([n.x, n.y, n.z], i * 6)
      nor.set([n.x, n.y, n.z], i * 6 + 3)
      if (i < N - 1) {
        const a = i * 2
        const b = a + 1
        const c = a + 2
        const d = a + 3
        // frames are right-handed (u × v = w): outer faces wind (a, c, b)
        if (flip) idx.push(a, b, c, b, d, c)
        else idx.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    geo.setIndex(idx)
    return geo
  }

  const ring = (zs: number[], top: boolean) => {
    const pos = new Float32Array(N * 2 * 3)
    const idx: number[] = []
    for (let i = 0; i < N; i++) {
      const o = pr.outer[i]
      const n = pr.inner[i]
      pos.set(toWorld(f, o.a, o.b, zs[i]), i * 6)
      pos.set(toWorld(f, n.a, n.b, zs[i]), i * 6 + 3)
      if (i < N - 1) {
        const a = i * 2
        const b = a + 1
        const c = a + 2
        const d = a + 3
        if (top) idx.push(a, c, b, b, c, d)
        else idx.push(a, b, c, b, d, c)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }

  const { metal, inner: innerMat, cut: cutMat } = mats
  const outerM = new THREE.Mesh(wall(pr.outer, false), metal)
  outerM.castShadow = true
  outerM.receiveShadow = true
  const innerM = new THREE.Mesh(wall(pr.inner, true), innerMat)
  const r0 = new THREE.Mesh(ring(z0, false), cutMat)
  const r1 = new THREE.Mesh(ring(z1, true), cutMat)
  g.add(outerM, innerM, r0, r1)

  if (view.seams && pc.templated) {
    // 0° seam (red) and 90° (amber) guide lines along the tube
    const mk = (p: number, mat: THREE.LineBasicMaterial) => {
      const q = profileAt(pr, p)
      const i = pr.outer.reduce((best, o, k) => (Math.abs(o.p - p) < Math.abs(pr.outer[best].p - p) ? k : best), 0)
      const lift = 0.35
      const A = toWorld(f, q.a + q.na * lift, q.b + q.nb * lift, z0[i])
      const B = toWorld(f, q.a + q.na * lift, q.b + q.nb * lift, z1[i])
      const geo = new THREE.BufferGeometry().setFromPoints([v3(A), v3(B)])
      const line = new THREE.Line(geo, mat)
      line.userData.noHighlight = true
      g.add(line)
    }
    mk(0, lines.seam0)
    mk(pr.perimeter / 4, lines.seam90)
  }
  // edges of cut rings for crispness
  const edge = (zs: number[]) => {
    const pts = pr.outer.map((o, i) => v3(toWorld(f, o.a + o.na * 0.05, o.b + o.nb * 0.05, zs[i])))
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lines.edge)
    line.userData.noHighlight = true
    g.add(line)
  }
  if (!pc.bottom.square) edge(z0)
  if (!pc.top.square) edge(z1)
  return g
}

function paperGeometry(pc: Piece, sh: Sheet, t: number): THREE.BufferGeometry {
  const pr = pc.profile
  const wr = sh.wrap!
  const P = pr.perimeter
  const pw = Math.max(0, Math.min(1, t)) * P
  const off = 0.45
  const cols = pr.outer
  const N = cols.length
  const pos = new Float32Array(N * 2 * 3)
  const uv = new Float32Array(N * 2 * 2)
  const idx: number[] = []
  const anchor = profileAt(pr, pw)
  for (let i = 0; i < N; i++) {
    const p = cols[i].p
    let a: number
    let b: number
    if (p <= pw) {
      const q = cols[i]
      a = q.a + q.na * off
      b = q.b + q.nb * off
    } else {
      // flat part continues along the tangent from the last wrapped point
      const ta = -anchor.nb
      const tb = anchor.na
      a = anchor.a + anchor.na * off + ta * (p - pw)
      b = anchor.b + anchor.nb * off + tb * (p - pw)
    }
    pos.set(toWorld(pc.frame, a, b, wr.zBottom), i * 6)
    pos.set(toWorld(pc.frame, a, b, wr.zTop), i * 6 + 3)
    uv.set([p / P, 0], i * 4)
    uv.set([p / P, 1], i * 4 + 2)
    if (i < N - 1) {
      const A = i * 2
      idx.push(A, A + 2, A + 1, A + 1, A + 2, A + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}
