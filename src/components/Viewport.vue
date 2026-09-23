<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Assembly } from '../core/joint'
import type { Sheet } from '../core/template'
import { TubeScene } from '../render/scene'

const props = defineProps<{
  asm: Assembly
  sheet: Sheet | null
  selected: string
  fitKey: string
  wrap: number
  xray: boolean
  seams: boolean
  showPaper: boolean
}>()
const emit = defineEmits<{ pick: [string] }>()

const host = ref<HTMLDivElement>()
const scene = shallowRef<TubeScene>()

const view = () => ({ xray: props.xray, seams: props.seams, wrap: props.wrap, wrapSheet: props.showPaper ? props.sheet : null })

onMounted(() => {
  const s = new TubeScene(host.value!)
  s.onPick = (id) => emit('pick', id)
  scene.value = s
  s.setAssembly(props.asm, view(), true)
  s.updatePaper(view())
  s.setSelected(props.selected)
  s.view('iso')
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  scene.value?.dispose()
})

// Coalesce prop changes into at most one scene update per animation frame:
// a slider drag fires many input events, but the scene only needs the latest state.
let raf = 0
let needMesh = false
let needPaper = false
let lastFit = props.fitKey
function schedule(mesh: boolean) {
  needMesh ||= mesh
  needPaper = true
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const s = scene.value
    if (!s) return
    if (needMesh) {
      const refit = lastFit !== props.fitKey
      lastFit = props.fitKey
      s.setAssembly(props.asm, view(), refit)
    }
    if (needPaper) s.updatePaper(view())
    needMesh = needPaper = false
  })
}
watch(() => [props.asm, props.xray, props.seams], () => schedule(true))
watch(() => [props.sheet, props.showPaper, props.wrap], () => schedule(false))
watch(
  () => props.selected,
  (id) => scene.value?.setSelected(id),
)

defineExpose({
  view: (n: 'iso' | 'front' | 'top' | 'side') => scene.value?.view(n),
  fit: () => scene.value?.fit(),
  snapshot: () => scene.value?.snapshot() ?? '',
})
</script>

<template>
  <div ref="host" class="vp" />
</template>

<style scoped>
.vp {
  position: absolute;
  inset: 0;
}
.vp :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
</style>
