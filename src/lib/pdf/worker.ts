import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * iOS Safari worker strategy
 * ══════════════════════════
 *
 * `?worker&inline` makes Vite bundle the pdf.js worker as an IIFE and embed
 * it as a same-origin `blob:` URL inside the main bundle. We then construct
 * the Worker ourselves and hand its port to pdf.js's `PDFWorker`, bypassing
 * pdf.js's internal `new Worker(url, { type: 'module' })` — which fails on
 * iOS Safari, where ESM worker support is limited and unreliable.
 *
 * Paired with `worker: { format: 'iife' }` in vite.config.ts.
 *
 * ⚠️  This only takes effect in a production build. Vite's dev server always
 *     serves module workers, so iOS must be verified against `npm run preview`,
 *     never `npm run dev`.
 *
 * The `legacy/` build is mandatory — see CLAUDE.md. pdf.js v6's default build
 * calls Promise.try, Promise.withResolvers, Math.sumPrecise and URL.parse with
 * no polyfills; Math.sumPrecise is Chrome 137+. legacy/ bundles core-js and
 * installs the polyfills into whichever scope loads it, main thread AND worker.
 * A main-thread-only polyfill cannot fix the worker — it is a separate realm.
 *
 * Changed from v1: there is no CDN fallback. v1 silently fell back to loading
 * the worker from cdnjs, which broke offline use, added a third-party
 * code-execution dependency, and quietly defeated the "nothing leaves your
 * device" guarantee. Failing loudly is the correct behaviour.
 */
import PdfWorkerInline from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';

let cached: pdfjsLib.PDFWorker | null = null;

export function getPdfWorker(): pdfjsLib.PDFWorker {
  if (cached && !cached.destroyed) return cached;

  // PDFWorker.create() is used rather than `new PDFWorker()` because the
  // generated .d.ts mistypes the constructor's `port` as `null | undefined`,
  // while the documented PDFWorkerParameters (and the runtime) accept a Worker.
  cached = pdfjsLib.PDFWorker.create({ port: new PdfWorkerInline() });
  return cached;
}

/** Release the worker. */
export function destroyPdfWorker(): void {
  if (cached && !cached.destroyed) cached.destroy();
  cached = null;
}
