import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Relative base so the build works under any sub-path (e.g. GitHub Pages /<repo>/)
export default defineConfig({
  base: './',
  plugins: [vue()],
})
