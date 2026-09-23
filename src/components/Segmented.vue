<script setup lang="ts" generic="T extends string | number">
defineProps<{ modelValue: T; options: { value: T; label: string; title?: string }[]; small?: boolean }>()
defineEmits<{ 'update:modelValue': [T] }>()
</script>

<template>
  <div class="seg" :class="{ small }" role="radiogroup">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="radio"
      :aria-checked="o.value === modelValue"
      :class="{ on: o.value === modelValue }"
      :title="o.title"
      @click="$emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: flex;
  background: var(--field);
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 3px;
  gap: 2px;
}
.seg button {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.seg.small button {
  font-size: 11.5px;
  padding: 4px 6px;
}
.seg button:hover {
  color: var(--text);
}
.seg button.on {
  background: var(--panel-3);
  color: var(--text);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>
