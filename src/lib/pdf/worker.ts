/**
 * Why `legacy/`, not the default build
 * ════════════════════════════════════
 *
 * pdf.js v6's DEFAULT build calls `Promise.try`, `Promise.withResolvers`,
 * `Math.sumPrecise` and `URL.parse`, and ships no polyfills for any of them.
 * `Math.sumPrecise` only landed in Chrome 137, so on an older Android WebView,
 * Samsung Internet, iOS Safari or Firefox the worker throws mid-parse and the
 * UI blames the file ("This PDF cannot be read").
 *
 * The `legacy/` build is upstream's answer: same API, but it bundles core-js
 * polyfills for 36+ built-ins and installs them into whatever scope it loads
 * in — main thread AND worker. A worker has its own global, so polyfilling on
 * the main thread alone does nothing for it.
 *
 * Verified against the shipped bundle: importing `legacy/pdf.worker.min.mjs`
 * installs all four built-ins; importing `build/pdf.worker.min.mjs` installs
 * none. Costs ~50 KB on the worker, ~57 KB on the main bundle.
 *
 * Do not "optimise" these back to plain 'pdfjs-dist' — that is the bug.
 */
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
 * Changed from v1: there is no CDN fallback. v1 silently fell back to loading
 * the worker from cdnjs, which broke offline use, added a third-party
 * code-execution dependency, and quietly defeated the "nothing leaves your
 * device" guarantee. Failing loudly is the correct behaviour.
 */
import PdfWorkerInline from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';

let cached: pdfjsLib.PDFWorker | null = null;

export function getPdfWorker(): pdfjsLib.PDFWorker {
  if (cached && !cached.destroyed) return cached;

  const port = new PdfWorkerInline() as unknown as Worker;
  cached = new pdfjsLib.PDFWorker({ port });
  return cached;
}

/** Release the worker. Called when the app tears down. */
export function destroyPdfWorker(): void {
  if (cached && !cached.destroyed) cached.destroy();
  cached = null;
}
