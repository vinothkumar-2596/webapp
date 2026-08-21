import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },

  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },

  // iOS Safari: 'iife' emits classic-script workers instead of ESM workers.
  // NOTE: this only applies to `vite build` — the dev server always serves
  // module workers. Verify iOS against `npm run preview`, never `npm run dev`.
  worker: {
    format: 'iife',
  },

  build: {
    target: 'es2020',
    sourcemap: true,
  },
})
