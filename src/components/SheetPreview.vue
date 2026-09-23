<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { Sheet } from '../core/template'
import { sheetToSvg } from '../render/svg'

const props = defineProps<{ sheet: Sheet }>()
const box = ref<HTMLDivElement>()
const t = reactive({ k: 1, x: 0, y: 0 })
const PX_PER_MM = 96 / 25.4

const svg = computed(() => sheetToSvg(props.sheet))

function fit() {
  const el = box.value
  if (!el) return
  const W = props.sheet.w * PX_PER_MM
  const H = props.sheet.h * PX_PER_MM
  const k = Math.min((el.clientWidth - 32) / W, (el.clientHeight - 32) / H)
  t.k = k
  t.x = (el.clientWidth - W * k) / 2
  t.y = (el.clientHeight - H * k) / 2
}
function zoomAt(f: number, cx: number, cy: number) {
  const k = Math.min(Math.max(t.k * f, 0.1), 20)
  const r = k / t.k
  t.x = cx - (cx - t.x) * r
  t.y = cy - (cy - t.y) * r
  t.k = k
}
function onWheel(e: WheelEvent) {
  const r = box.value!.getBoundingClientRect()
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
}
function zoomBtn(f: number) {
  const el = box.value!
  zoomAt(f, el.clientWidth / 2, el.clientHeight / 2)
}
function realSize() {
  const el = box.value!
  zoomAt(1 / t.k, el.clientWidth / 2, el.clientHeight / 2)
}
let drag: { x: number; y: number; tx: number; ty: number } | null = null
function onDown(e: PointerEvent) {
  drag = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!drag) return
  t.x = drag.tx + e.clientX - drag.x
  t.y = drag.ty + e.clientY - drag.y
}
function onUp() {
  drag = null
}

onMounted(() => {
  fit()
  new ResizeObserver(() => fit()).observe(box.value!)
})
let lastId = ''
watch(
  () => props.sheet,
  async (s) => {
    if (s.id !== lastId) {
      lastId = s.id
      await nextTick()
      fit()
    }
  },
)
defineExpose({ fit })
</script>

<template>
  <div
    ref="box"
    class="sp"
    @wheel.prevent="onWheel"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @dblclick="fit"
  >
    <div class="sp-paper" :style="{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }" v-html="svg" />
    <div class="sp-tools" @pointerdown.stop>
      <button title="Thu nhỏ" @click="zoomBtn(1 / 1.25)">−</button>
      <span class="sp-zoom">{{ Math.round(t.k * 100) }}%</span>
      <button title="Phóng to" @click="zoomBtn(1.25)">+</button>
      <button title="Vừa khung" @click="fit">⤢</button>
      <button title="Kích thước thật (xấp xỉ, tùy màn hình)" @click="realSize">1:1</button>
    </div>
  </div>
</template>

<style scoped>
.sp {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.06) 1px, transparent 0) 0 0 / 16px 16px,
    var(--bg-2);
  border-radius: 10px;
  cursor: grab;
  user-select: none;
}
.sp:active {
  cursor: grabbing;
}
.sp-paper {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.3);
  line-height: 0;
}
.sp-tools {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(18, 22, 29, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 3px;
  cursor: default;
}
.sp-tools button {
  border: 0;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  min-width: 28px;
  height: 26px;
  border-radius: 6px;
  cursor: pointer;
}
.sp-tools button:hover {
  background: var(--panel-3);
  color: var(--text);
}
.sp-zoom {
  font-size: 11px;
  color: var(--text-3);
  min-width: 40px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
