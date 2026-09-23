<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { buildAssembly, type JointConfig } from './core/joint'
import { PRESETS, defaultConfig } from './core/presets'
import { fmt, specLabel } from './core/profile'
import { buildSheets, defaultTemplateOptions, type Sheet, type TemplateOptions } from './core/template'
import { PAPERS, sheetsToPdf, type PaperSize } from './render/pdf'
import { sheetToSvg } from './render/svg'
import { sheetToDxf } from './render/dxf'
import NumField from './components/NumField.vue'
import Segmented from './components/Segmented.vue'
import JointIcon from './components/JointIcon.vue'
import TubeEditor from './components/TubeEditor.vue'
import Viewport from './components/Viewport.vue'
import SheetPreview from './components/SheetPreview.vue'

const STORE = 'tubejig:v1'

interface Saved {
  cfg: JointConfig
  topt: TemplateOptions
  paper: PaperSize
}

function load(): Saved {
  const base: Saved = { cfg: defaultConfig(), topt: { ...defaultTemplateOptions }, paper: 'A4' }
  try {
    const h = location.hash.startsWith('#j=') ? JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(3))))) : null
    const s = h ?? JSON.parse(localStorage.getItem(STORE) ?? 'null')
    if (s?.cfg) return { cfg: { ...base.cfg, ...s.cfg }, topt: { ...base.topt, ...s.topt }, paper: s.paper ?? 'A4' }
  } catch {
    /* fall back to defaults */
  }
  return base
}

const saved = load()
const cfg = reactive<JointConfig>(saved.cfg)
const topt = reactive<TemplateOptions>(saved.topt)
const paper = ref<PaperSize>(saved.paper)
const activePreset = ref(detectPreset())

watch(
  [cfg, topt, paper],
  () => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ cfg, topt, paper: paper.value }))
    } catch {
      /* storage unavailable */
    }
  },
  { deep: true },
)

function detectPreset() {
  if (cfg.type === 'elbow') return cfg.segments > 2 ? 'lobster' : 'miter'
  const b = cfg.branch.kind === 'round' ? 'r' : 'b'
  const h = cfg.header.kind === 'round' ? 'r' : 'b'
  return b + h
}
watch(
  () => [cfg.type, cfg.segments, cfg.branch.kind, cfg.header.kind],
  () => (activePreset.value = detectPreset()),
)

function applyPreset(id: string) {
  const p = PRESETS.find((x) => x.id === id)!
  Object.assign(cfg, p.apply(JSON.parse(JSON.stringify(cfg))))
  activePreset.value = id
}

const asm = computed(() => buildAssembly(JSON.parse(JSON.stringify(cfg))))
const sheets = computed(() => buildSheets(asm.value, { ...topt }))
const activeId = ref('')
const sheet = computed<Sheet | null>(() => sheets.value.find((s) => s.id === activeId.value) ?? sheets.value[0] ?? null)
watch(sheets, (ss) => {
  if (!ss.find((s) => s.id === activeId.value)) activeId.value = ss[0]?.id ?? ''
})
const fitKey = computed(() => `${cfg.type}|${cfg.segments}|${cfg.branch.kind}|${cfg.header.kind}`)

function onPick(id: string) {
  const s = sheets.value.find((x) => x.pieceId === id)
  if (s) activeId.value = s.id
}

// 3D view state
const xray = ref(false)
const seams = ref(true)
const showPaper = ref(true)
const wrap = ref(0.72)
const vp = ref<InstanceType<typeof Viewport>>()
let anim = 0
const playing = ref(false)
function playWrap() {
  cancelAnimationFrame(anim)
  if (playing.value) {
    playing.value = false
    return
  }
  playing.value = true
  showPaper.value = true
  const from = wrap.value >= 0.99 ? 0 : wrap.value
  const t0 = performance.now()
  const dur = 2200 * (1 - from)
  const step = (now: number) => {
    const k = Math.min((now - t0) / dur, 1)
    const e = 1 - Math.pow(1 - k, 3)
    wrap.value = from + (1 - from) * e
    if (k < 1) anim = requestAnimationFrame(step)
    else playing.value = false
  }
  anim = requestAnimationFrame(step)
}

// exports
const busy = ref('')
const toast = ref('')
let toastT = 0
function say(m: string) {
  toast.value = m
  clearTimeout(toastT)
  toastT = window.setTimeout(() => (toast.value = ''), 2600)
}
const projectTitle = computed(() => {
  if (cfg.type === 'elbow') return `${cfg.segments > 2 ? `Cút tôm ${cfg.segments} đốt` : 'Góc vát'} ${fmt(cfg.elbowAngle)}° · ${specLabel(cfg.branch)}`
  return `Mối ghép ${fmt(cfg.angle)}° · ${specLabel(cfg.branch)} → ${specLabel(cfg.header)}`
})
const fileBase = computed(() => projectTitle.value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_'))

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
async function makePdf(all: boolean) {
  const list = all ? sheets.value : sheet.value ? [sheet.value] : []
  return sheetsToPdf(list, { paper: paper.value, margin: 10, overlap: 10, includeTable: true }, projectTitle.value)
}
async function exportPdf(all = true) {
  busy.value = 'pdf'
  try {
    const doc = await makePdf(all)
    doc.save(`${fileBase.value}.pdf`)
    say('Đã tải PDF — nhớ in 100% (Actual size)')
  } finally {
    busy.value = ''
  }
}
async function printPdf() {
  busy.value = 'print'
  const w = window.open('', '_blank')
  try {
    const doc = await makePdf(true)
    const url = doc.output('bloburl') as unknown as string
    if (w) w.location.href = url
    else window.open(url, '_blank')
  } finally {
    busy.value = ''
  }
}
function exportSvg() {
  if (!sheet.value) return
  download(`${fileBase.value}_${sheet.value.id}.svg`, sheetToSvg(sheet.value, { standalone: true }), 'image/svg+xml')
}
function exportDxf() {
  if (!sheet.value) return
  download(`${fileBase.value}_${sheet.value.id}.dxf`, sheetToDxf(sheet.value), 'application/dxf')
}
function exportPng() {
  const d = vp.value?.snapshot()
  if (!d) return
  const a = document.createElement('a')
  a.href = d
  a.download = `${fileBase.value}_3d.png`
  a.click()
}
async function share() {
  const data = btoa(unescape(encodeURIComponent(JSON.stringify({ cfg, topt, paper: paper.value }))))
  const url = `${location.origin}${location.pathname}#j=${data}`
  history.replaceState(null, '', `#j=${data}`)
  try {
    await navigator.clipboard.writeText(url)
    say('Đã copy link chia sẻ')
  } catch {
    say('Link đã cập nhật trên thanh địa chỉ')
  }
}
function reset() {
  Object.assign(cfg, defaultConfig())
  Object.assign(topt, defaultTemplateOptions)
  history.replaceState(null, '', location.pathname)
}

const pageInfo = computed(() => {
  const s = sheet.value
  if (!s) return ''
  const [a, b] = PAPERS[paper.value]
  const fits = (W: number, H: number) => s.w <= W - 20 && s.h <= H - 26
  if (fits(a, b) || fits(b, a)) return `Vừa 1 trang ${paper.value}`
  const pages = (W: number, H: number) => Math.ceil((s.w - 10) / (W - 30)) * Math.ceil((s.h - 10) / (H - 36))
  return `Ghép ${Math.min(pages(a, b), pages(b, a))} trang ${paper.value}`
})
const tableOpen = ref(false)
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand">
        <svg viewBox="0 0 32 32" class="logo" aria-hidden="true">
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#ffb35c" />
              <stop offset="1" stop-color="#ff6a1a" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#lg)" />
          <path d="M9 21h14M9 25h14M13 7v10c0 0 1.2 2 3 2s3-2 3-2V7" fill="none" stroke="#1b0e04" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        <div>
          <div class="brand-name">TubeJig</div>
          <div class="brand-sub">Cữ cắt sắt ống &amp; sắt hộp · in tỉ lệ 1:1</div>
        </div>
      </div>
      <div class="top-title">{{ projectTitle }}</div>
      <div class="top-actions">
        <button class="btn ghost" @click="share">Chia sẻ link</button>
        <button class="btn ghost" @click="reset">Mặc định</button>
      </div>
    </header>

    <aside class="side">
      <section class="card">
        <h3>Kiểu mối ghép</h3>
        <div class="presets">
          <button v-for="p in PRESETS" :key="p.id" class="preset" :class="{ on: activePreset === p.id }" :title="p.hint" @click="applyPreset(p.id)">
            <JointIcon :id="p.icon" />
            <span class="preset-name">{{ p.name }}</span>
            <span class="preset-hint">{{ p.hint }}</span>
          </button>
        </div>
      </section>

      <section class="card">
        <h3>{{ cfg.type === 'saddle' ? 'Ống nhánh (ống được cắt)' : 'Ống / sắt hộp' }}</h3>
        <TubeEditor v-model="cfg.branch" :rect-labels="['Cạnh theo mặt phẳng góc', 'Cạnh ngang']" />
      </section>

      <section v-if="cfg.type === 'saddle'" class="card">
        <h3>Ống chính (ống nền)</h3>
        <TubeEditor v-model="cfg.header" :rect-labels="['Bề rộng mặt tựa', 'Chiều cao']" />
      </section>

      <section class="card">
        <h3>Góc &amp; vị trí</h3>
        <div class="stack">
          <template v-if="cfg.type === 'saddle'">
            <NumField v-model="cfg.angle" label="Góc giữa 2 trục ống" unit="°" :min="15" :max="90" :step="0.5" slider />
            <div class="chips">
              <button v-for="a in [30, 45, 60, 75, 90]" :key="a" class="chip" :class="{ on: cfg.angle === a }" @click="cfg.angle = a">{{ a }}°</button>
            </div>
            <NumField
              v-model="cfg.offset"
              label="Lệch tâm"
              :min="-200"
              :max="200"
              :step="0.5"
              slider
              :slider-min="-(cfg.header.kind === 'round' ? cfg.header.od : cfg.header.w) / 2"
              :slider-max="(cfg.header.kind === 'round' ? cfg.header.od : cfg.header.w) / 2"
              hint="Dịch trục ống nhánh sang ngang so với trục ống chính"
            />
            <NumField v-model="cfg.branchLen" label="Dài ống nhánh (điểm dài nhất)" :min="10" :max="6000" :step="1" />
            <NumField v-model="cfg.headerLen" label="Dài ống chính (hiển thị)" :min="20" :max="6000" :step="1" />
          </template>
          <template v-else>
            <NumField v-model="cfg.elbowAngle" label="Góc chuyển hướng" unit="°" :min="1" :max="179" :step="0.5" slider hint="90° = góc vuông. Góc giữa 2 ống = 180° − giá trị này" />
            <div class="chips">
              <button v-for="a in [30, 45, 60, 90, 120]" :key="a" class="chip" :class="{ on: cfg.elbowAngle === a }" @click="cfg.elbowAngle = a">{{ a }}°</button>
            </div>
            <NumField v-model="cfg.segments" label="Số đốt" unit="đốt" :min="2" :max="12" :step="1" slider />
            <NumField v-if="cfg.segments > 2" v-model="cfg.bendRadius" label="Bán kính uốn (tâm ống)" :min="1" :max="3000" :step="1" />
            <NumField v-model="cfg.tail" label="Đoạn thẳng 2 đầu" :min="0" :max="6000" :step="1" />
          </template>
        </div>
      </section>

      <section class="card">
        <h3>Cữ cắt</h3>
        <div class="stack">
          <div class="field-label">Tính theo mặt</div>
          <Segmented
            v-model="cfg.fit"
            small
            :options="[
              { value: 'safe', label: 'Không cấn', title: 'Lấy giá trị ăn sâu nhất qua bề dày thành — không bị cấn, khe hàn hình V' },
              { value: 'outer', label: 'Ngoài', title: 'Theo mặt ngoài ống nhánh' },
              { value: 'mean', label: 'Giữa', title: 'Theo đường giữa bề dày thành' },
              { value: 'inner', label: 'Trong', title: 'Theo mặt trong ống nhánh' },
            ]"
          />
          <label v-if="cfg.type === 'saddle'" class="check">
            <input v-model="cfg.hole" type="checkbox" />
            <span>Thêm cữ khoét lỗ trên ống chính</span>
          </label>
          <NumField v-model="topt.fullMax" label="Gộp 1 cữ nếu ống ngắn hơn" :min="40" :max="2000" :step="10" hint="Ống dài hơn sẽ tách cữ riêng cho từng đầu cắt, kèm đường chuẩn" />
          <NumField v-model="topt.refGap" label="Đường chuẩn cách mép cắt" :min="5" :max="200" :step="1" />
          <NumField v-model="topt.stations" label="Số vạch trong bảng tọa độ" unit="vạch" :min="4" :max="72" :step="1" />
        </div>
      </section>
    </aside>

    <main class="stage">
      <Viewport ref="vp" :asm="asm" :sheet="sheet" :selected="sheet?.pieceId ?? ''" :fit-key="fitKey" :wrap="wrap" :xray="xray" :seams="seams" :show-paper="showPaper" @pick="onPick" />
      <div class="hud hud-tl">
        <div class="tb">
          <button @click="vp?.view('iso')">3D</button>
          <button @click="vp?.view('front')">Trước</button>
          <button @click="vp?.view('side')">Cạnh</button>
          <button @click="vp?.view('top')">Trên</button>
        </div>
      </div>
      <div class="hud hud-tr">
        <div class="tb">
          <button :class="{ on: xray }" @click="xray = !xray">X-quang</button>
          <button :class="{ on: seams }" @click="seams = !seams">Vạch 0°/90°</button>
          <button :class="{ on: showPaper }" @click="showPaper = !showPaper">Giấy cữ</button>
          <button title="Tải ảnh 3D" @click="exportPng">PNG</button>
        </div>
      </div>
      <div v-if="asm.warnings.length" class="hud hud-warn">
        <div v-for="w in asm.warnings" :key="w" class="warn">{{ w }}</div>
      </div>
      <div class="hud hud-bl">
        <div v-for="f in asm.facts" :key="f.label" class="fact">
          <span>{{ f.label }}</span>
          <b>{{ f.value }}</b>
        </div>
      </div>
      <div class="hud hud-bc" :class="{ dim: !showPaper || !sheet?.wrap }">
        <button class="play" :title="playing ? 'Dừng' : 'Quấn cữ lên ống'" @click="playWrap">
          <svg v-if="!playing" viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
          <svg v-else viewBox="0 0 16 16"><path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /></svg>
        </button>
        <span class="wrap-label">Quấn cữ</span>
        <input v-model.number="wrap" type="range" min="0" max="1" step="0.001" :style="{ '--p': `${wrap * 100}%` }" @input="showPaper = true" />
        <span class="wrap-val">{{ Math.round(wrap * 100) }}%</span>
      </div>
      <div class="hint-pick">Bấm vào ống để xem cữ của ống đó · kéo để xoay · cuộn để zoom</div>
    </main>

    <section class="sheet">
      <div class="sheet-head">
        <h3>Cữ in</h3>
        <span class="muted">{{ sheets.length }} tờ</span>
      </div>
      <div class="tabs">
        <button v-for="s in sheets" :key="s.id" class="tab" :class="{ on: s.id === sheet?.id }" @click="activeId = s.id">
          <span>{{ s.title }}</span>
          <small>{{ s.subtitle }}<template v-if="s.qty > 1"> · ×{{ s.qty }}</template></small>
        </button>
      </div>
      <SheetPreview v-if="sheet" :sheet="sheet" class="preview" />
      <div v-if="sheet?.stations.rows.length" class="table" :class="{ open: tableOpen }">
        <button class="table-toggle" @click="tableOpen = !tableOpen">
          <span>Bảng tọa độ vạch dấu</span>
          <small>{{ sheet.stations.heading }}</small>
          <span class="caret">{{ tableOpen ? '▾' : '▸' }}</span>
        </button>
        <div v-if="tableOpen" class="table-grid">
          <div v-for="r in sheet.stations.rows" :key="r.label" class="trow">
            <span>{{ r.label }}</span>
            <b>{{ fmt(r.value) }}</b>
          </div>
        </div>
      </div>
      <div class="export">
        <div class="export-row">
          <Segmented
            v-model="paper"
            small
            :options="[
              { value: 'A4', label: 'A4' },
              { value: 'A3', label: 'A3' },
              { value: 'A2', label: 'A2' },
              { value: 'Letter', label: 'Letter' },
            ]"
          />
          <span class="muted page-info">{{ pageInfo }}</span>
        </div>
        <div class="export-row">
          <button class="btn primary grow" :disabled="!!busy" @click="exportPdf(true)">
            {{ busy === 'pdf' ? 'Đang tạo…' : 'Tải PDF tất cả cữ' }}
          </button>
          <button class="btn" :disabled="!!busy" @click="printPdf">{{ busy === 'print' ? '…' : 'In' }}</button>
        </div>
        <div class="export-row">
          <button class="btn small grow" @click="exportPdf(false)">PDF tờ này</button>
          <button class="btn small grow" @click="exportSvg">SVG</button>
          <button class="btn small grow" title="Cho máy cắt laser / plasma / CAD" @click="exportDxf">DXF</button>
        </div>
        <p class="note">In ở chế độ <b>100% / Actual size</b>, tắt “Fit to page”. Đo lại thước 50 mm trên giấy trước khi dùng.</p>
      </div>
    </section>

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>
