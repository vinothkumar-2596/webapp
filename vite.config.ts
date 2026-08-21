import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  // Relative base so the same build works at a domain root (Netlify) and under
  // a sub-path (GitHub Pages: /webapp/). There is no router, so no deep links
  // depend on an absolute base.
  base: './',

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
    // Vite 8 / Rolldown: opt in so the dynamically-imported pdf.js engine
    // (~1.9 MB with its inlined worker) becomes its own chunk instead of
    // being merged into the initial bundle.
    rolldownOptions: {
      output: { codeSplitting: true },
    },
  },
})
