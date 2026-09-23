<script setup lang="ts">
defineProps<{ id: string }>()
</script>

<template>
  <svg viewBox="0 0 56 40" class="ji" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
    <template v-if="id === 'rr'">
      <path d="M4 26h48M4 36h48" />
      <ellipse cx="4" cy="31" rx="2" ry="5" />
      <path d="M22 4v19c0 0 2.5 3 6 3s6-3 6-3V4" class="hi" />
      <ellipse cx="28" cy="4" rx="6" ry="1.8" class="hi" />
    </template>
    <template v-else-if="id === 'rb'">
      <rect x="4" y="26" width="48" height="10" rx="1" />
      <path d="M17 26 29 5M27 26 39 5" class="hi" />
      <ellipse cx="34" cy="5" rx="5" ry="1.6" class="hi" transform="rotate(-30 34 5)" />
    </template>
    <template v-else-if="id === 'br'">
      <path d="M4 26h48M4 36h48" />
      <ellipse cx="4" cy="31" rx="2" ry="5" />
      <path d="M21 4v18c3 3 11 3 14 0V4M21 4h14" class="hi" />
    </template>
    <template v-else-if="id === 'bb'">
      <rect x="4" y="27" width="48" height="9" rx="1" />
      <path d="M12 27 30 5h9L21 27" class="hi" />
    </template>
    <template v-else-if="id === 'miter'">
      <path d="M6 30h22l8-8V8M6 38h26l12-12V8" />
      <path d="M28 30 32 38" class="hi" stroke-dasharray="2 2" />
    </template>
    <template v-else>
      <path d="M4 30h12l6-2 6-5 4-6 2-7V4M4 38h14l9-3 8-7 5-8 2-8V4" />
      <path d="M16 30l2 8M22 28l5 7M28 23l7 5M32 17l8 3" class="hi" />
    </template>
  </svg>
</template>

<style scoped>
.ji {
  width: 56px;
  height: 40px;
  color: var(--text-3);
}
.ji .hi {
  color: var(--accent);
  stroke: var(--accent);
}
</style>
