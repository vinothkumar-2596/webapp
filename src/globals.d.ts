/**
 * The legacy pdf.js worker bundle has no shipped type declaration.
 * (`legacy/build/pdf.mjs` does — it re-exports the package types — so it
 * needs no declaration here.)
 *
 * Imported for its polyfill side-effects in pdfjsBuild.test.ts, and via
 * `?worker&inline` in worker.ts, which Vite types separately.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
