<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: number
    unit?: string
    min?: number
    max?: number
    step?: number
    slider?: boolean
    sliderMin?: number
    sliderMax?: number
    hint?: string
  }>(),
  { unit: 'mm', step: 0.1, slider: false },
)
const emit = defineEmits<{ 'update:modelValue': [number] }>()

const text = ref(fmt(props.modelValue))
watch(
  () => props.modelValue,
  (v) => {
    if (parseFloat(text.value.replace(',', '.')) !== v) text.value = fmt(v)
  },
)

function fmt(v: number) {
  return String(Math.round(v * 1000) / 1000)
}
function clamp(v: number) {
  if (props.min !== undefined) v = Math.max(props.min, v)
  if (props.max !== undefined) v = Math.min(props.max, v)
  return v
}
function commit() {
  const v = parseFloat(text.value.replace(',', '.'))
  if (Number.isFinite(v)) {
    const c = clamp(v)
    emit('update:modelValue', c)
    text.value = fmt(c)
  } else text.value = fmt(props.modelValue)
}
function onInput() {
  const v = parseFloat(text.value.replace(',', '.'))
  if (Number.isFinite(v) && (props.min === undefined || v >= props.min) && (props.max === undefined || v <= props.max)) emit('update:modelValue', v)
}
function nudge(e: KeyboardEvent, dir: number) {
  e.preventDefault()
  const k = e.shiftKey ? 10 : 1
  const c = clamp(Math.round((props.modelValue + dir * props.step * k) * 1000) / 1000)
  emit('update:modelValue', c)
  text.value = fmt(c)
}
function onRange(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  emit('update:modelValue', v)
  text.value = fmt(v)
}
</script>

<template>
  <label class="nf" :title="hint">
    <span class="nf-top">
      <span class="nf-label">{{ label }}</span>
      <span class="nf-box">
        <input
          v-model="text"
          inputmode="decimal"
          @input="onInput"
          @change="commit"
          @blur="commit"
          @keydown.enter="commit"
          @keydown.up="nudge($event, 1)"
          @keydown.down="nudge($event, -1)"
        />
        <span class="nf-unit">{{ unit }}</span>
      </span>
    </span>
    <input
      v-if="slider"
      class="nf-range"
      type="range"
      :min="sliderMin ?? min"
      :max="sliderMax ?? max"
      :step="step"
      :value="modelValue"
      :style="{ '--p': `${((modelValue - (sliderMin ?? min ?? 0)) / ((sliderMax ?? max ?? 1) - (sliderMin ?? min ?? 0))) * 100}%` }"
      @input="onRange"
    />
  </label>
</template>

<style scoped>
.nf {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nf-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.nf-label {
  color: var(--text-2);
  font-size: 12.5px;
}
.nf-box {
  display: flex;
  align-items: center;
  background: var(--field);
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 0 8px 0 0;
  transition: border-color 0.15s;
}
.nf-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.nf-box input {
  width: 72px;
  background: transparent;
  border: 0;
  color: var(--text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  padding: 6px 4px 6px 9px;
  text-align: right;
  outline: none;
}
.nf-unit {
  color: var(--text-3);
  font-size: 11px;
  min-width: 18px;
}
.nf-range {
  width: 100%;
}
</style>
