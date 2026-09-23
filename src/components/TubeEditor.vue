<script setup lang="ts">
import { computed } from 'vue'
import type { TubeSpec } from '../core/profile'
import { RECT_SIZES, ROUND_SIZES } from '../core/presets'
import NumField from './NumField.vue'
import Segmented from './Segmented.vue'

const spec = defineModel<TubeSpec>({ required: true })
defineProps<{ rectLabels?: [string, string] }>()

const set = (patch: Partial<TubeSpec>) => (spec.value = { ...spec.value, ...patch })

const kind = computed({
  get: () => spec.value.kind,
  set: (k) => {
    if (k === spec.value.kind) return
    if (k === 'rect') {
      const s = Math.round(spec.value.od * 0.8)
      set({ kind: 'rect', w: s, h: s, rc: Math.max(spec.value.wall * 1.5, 1) })
    } else set({ kind: 'round', od: Math.max(spec.value.w, spec.value.h) })
  },
})

const presetValue = computed(() => {
  const s = spec.value
  if (s.kind === 'round') return ROUND_SIZES.find((r) => Math.abs(r.od - s.od) < 0.01)?.label ?? ''
  return RECT_SIZES.find((r) => Math.abs(r.w - s.w) < 0.01 && Math.abs(r.h - s.h) < 0.01)?.label ?? ''
})

function pickPreset(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (spec.value.kind === 'round') {
    const r = ROUND_SIZES.find((x) => x.label === v)
    if (r) set({ od: r.od })
  } else {
    const r = RECT_SIZES.find((x) => x.label === v)
    if (r) set({ w: r.w, h: r.h })
  }
}
</script>

<template>
  <div class="te">
    <div class="te-row">
      <Segmented
        v-model="kind"
        small
        :options="[
          { value: 'round', label: 'Ống tròn' },
          { value: 'rect', label: 'Sắt hộp' },
        ]"
      />
      <select class="te-select" :value="presetValue" @change="pickPreset">
        <option value="" disabled>Quy cách…</option>
        <template v-if="spec.kind === 'round'">
          <option v-for="r in ROUND_SIZES" :key="r.label" :value="r.label">{{ r.label }}</option>
        </template>
        <template v-else>
          <option v-for="r in RECT_SIZES" :key="r.label" :value="r.label">{{ r.label }}</option>
        </template>
      </select>
    </div>
    <div class="te-grid">
      <NumField v-if="spec.kind === 'round'" label="Đường kính ngoài" :model-value="spec.od" :min="5" :max="1000" @update:model-value="set({ od: $event })" />
      <template v-else>
        <NumField :label="rectLabels?.[0] ?? 'Cạnh A'" :model-value="spec.w" :min="5" :max="1000" @update:model-value="set({ w: $event })" />
        <NumField :label="rectLabels?.[1] ?? 'Cạnh B'" :model-value="spec.h" :min="5" :max="1000" @update:model-value="set({ h: $event })" />
      </template>
      <NumField label="Độ dày thành" :model-value="spec.wall" :min="0.3" :max="40" @update:model-value="set({ wall: $event })" />
      <NumField v-if="spec.kind === 'rect'" label="Bo góc ngoài" :model-value="spec.rc" :min="0.3" :max="50" hint="Bán kính bo góc ngoài của sắt hộp" @update:model-value="set({ rc: $event })" />
    </div>
  </div>
</template>

<style scoped>
.te {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.te-row {
  display: grid;
  grid-template-columns: 1fr 118px;
  gap: 8px;
}
.te-select {
  background: var(--field);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  font-size: 12.5px;
  padding: 0 8px;
}
.te-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
