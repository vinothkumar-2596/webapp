# label-console

Amazon packing slip PDF → printable QR shipping labels. Vite + React, client-only:
the PDF never leaves the device.

## Hard constraint: always import pdf.js from `pdfjs-dist/legacy/build/*`

**Never** import plain `'pdfjs-dist'` or `'pdfjs-dist/build/pdf.worker.min.mjs'`.
Every pdf.js import — main thread *and* worker — must use the `legacy/` path:

```ts
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfWorkerInline from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';
```

### Why

pdf.js v6's **default build calls four modern built-ins and ships no polyfills
for them**. Instrumented counts from one real parse:

| Built-in | Calls / parse | Shipped in |
|---|---|---|
| `Promise.withResolvers` | 12 | Chrome 119 / Safari 17.4 / FF 121 |
| `Promise.try` | 7 | Chrome 128 / Safari 18.2 / FF 134 |
| `Math.sumPrecise` | 3 | **Chrome 137** |
| `URL.parse` | 0 here, used elsewhere | Chrome 126 / Safari 18 / FF 126 |

`Math.sumPrecise` is Chrome-137-and-newer. On an older Android WebView, Samsung
Internet, iOS Safari or Firefox the worker throws mid-parse and the UI blames
the file — the reported "This PDF cannot be read" bug.

The `legacy/` build is upstream's answer: same API, but it bundles core-js
polyfills for 36+ built-ins and installs them into whatever scope loads it.
Verified directly against the minified artifacts:

- `legacy/build/pdf.worker.min.mjs` → restores all four built-ins on import
- `build/pdf.worker.min.mjs` → restores **none**

Cost is ~50 KB on the worker and ~57 KB on the main bundle. Worth it.

### A main-thread polyfill does NOT fix this

A Web Worker has its own global object. Patching `Math.sumPrecise` in
`main.tsx` (or a `polyfills.ts`) does nothing for the worker, which is where
pdf.js does 16 of its 17 `sumPrecise` calls. This was v1's bug. Do not
"solve" it by adding a polyfill module — use the `legacy/` build in both scopes.

### Types are identical

`legacy/build/pdf.d.mts` is literally `export * from "pdfjs-dist"`, so switching
to `legacy/` costs nothing in type fidelity. If `PDFWorker`'s `port` param
mistypes as `null | undefined`, that is a pre-existing pdf.js `.d.ts` bug
present on both paths — use `PDFWorker.create({ port })` to work around it, and
keep the `legacy/` import.

## Worker strategy

`?worker&inline` makes Vite bundle the worker as an IIFE and embed it as a
same-origin `blob:` URL, then we hand the port to `PDFWorker` ourselves. This
bypasses pdf.js's internal `new Worker(url, { type: 'module' })`, which is
unreliable on older iOS Safari. Paired with `worker: { format: 'iife' }` in
`vite.config.ts`.

Only takes effect in a production build — Vite's dev server always serves module
workers, so verify mobile against `npm run preview`, never `npm run dev`.

There is deliberately **no CDN fallback**. It would break offline use and defeat
the "nothing leaves your device" guarantee. A same-origin main-thread fallback
(`globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs')`)
is the correct degradation if one is ever needed.

## Commands

```
npm run verify     # typecheck + lint + test + build — run before pushing
npm run preview    # production build; the only valid way to test mobile
```
