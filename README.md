# Label Console — Vape From France

Import an Amazon packing-slip PDF, get print-ready QR shipping labels.
**Parsed entirely in the browser — no customer address ever leaves the device.**

An internal warehouse tool: one PDF page becomes one shipping label, with the order
number encoded as a QR code. Installable as a PWA on desktop, Android, and iOS.

---

## Quick start

```bash
npm install
npm run dev          # → http://localhost:5173
```

| Command | Description |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc` only |
| `npm run test` | Vitest (parser + build guards) |
| `npm run lint` | oxlint |
| `npm run verify` | typecheck → lint → test → build |

Requires Node 20.19+ or 22.12+.

---

## The core guarantee: nothing is ever invented

The previous version generated a **random order number** when it could not parse one,
and silently relabelled unrecognised countries as `France`. Those labels were
indistinguishable from correct ones, and they got printed onto real parcels.

This version never substitutes a plausible value for a missing one:

```ts
type Extracted<T> =
  | { value: T;    confidence: 'high' | 'low' }
  | { value: null; confidence: 'missing' };
```

Every field carries its own provenance:

| Confidence | Meaning |
|---|---|
| `high` | Found via an explicit label anchor (`Numéro de la commande: …`) |
| `low` | Found by shape alone, unanchored — plausible but unverified |
| `missing` | Not found. Value is `null`. **Never guessed.** |

A label that is missing an order number, recipient, address, or country is flagged
`Needs review`, **deselected automatically**, and **excluded from printing** while
*Require address verification* is on (the default). It prints no QR code at all,
rather than a scannable code pointing at an order that does not exist.

---

## How it works

```
PDF file ──► extract text ──► reconstruct lines ──► parse fields ──► review ──► print
   │              │                   │                   │             │         │
   │         pdf.js worker      Y-cluster + X-sort   confidence rules  operator  CSS @page
   └────────────── all in the browser · nothing uploaded ──────────────────────────┘
```

**Screens:** Overview (KPIs from real local data) · Label batches (table + preview +
print sheet) · New import · Label template (print settings).

---

## Architecture

```
src/
├── main.tsx
├── app/
│   ├── App.tsx            screen routing
│   ├── Shell.tsx          sidebar + topbar
│   └── store.tsx          reducer + IndexedDB persistence
├── screens/               Overview · Import · Batch · Template
├── components/            ui · ShipLabel · PrintSheet · EditLabelDialog
└── lib/
    ├── types.ts           Zod schemas — single source of truth
    ├── storage.ts         IndexedDB (idb-keyval)
    └── pdf/
        ├── worker.ts      iOS-safe PDFWorker singleton
        ├── extractText.ts PDF → PageText[]
        ├── lines.ts       run clustering (pure, no pdf.js)
        ├── parseSlip.ts   PageText → Label (pure, fully tested)
        ├── countries.ts   31 destinations, multi-language
        └── errors.ts      typed PdfError with operator-facing guidance
```

`parseSlip.ts` and `lines.ts` are **pure and free of any pdf.js import**, so the
highest-risk code is unit-testable in plain Node.

**Stack:** React 19 · TypeScript (strict) · Vite 8 · Tailwind v4 · Zod · Radix Dialog ·
pdf.js · qrcode.react · idb-keyval.

---

## Testing

```bash
npm test
```

34 tests. The parser is covered by **golden fixtures** — anonymised text dumps of real
packing-slip layouts in `src/lib/pdf/__fixtures__/`. When Amazon changes their layout,
a test fails in CI instead of a customer receiving the wrong parcel.

Fixtures cover: standard French, long addresses with company lines, German and Dutch
destinations, missing order numbers, unanchored order numbers, unknown countries,
billing-before-shipping ordering, and pages with no ship-to anchor at all.

To add a fixture: run a real PDF through `extractPdfText()`, save the text output,
and **replace every real name, address, and phone with fake data**. Commit text, never PDFs.

---

## Browser support

Works on Chrome, Edge, Firefox, and Safari — desktop and mobile.

### pdf.js must come from `legacy/build` — see [CLAUDE.md](./CLAUDE.md)

pdf.js v6's default build calls `Promise.try`, `Promise.withResolvers`,
`Math.sumPrecise`, and `URL.parse` and ships **no polyfills**. `Math.sumPrecise` is
Chrome 137+, so on older Android WebView, Samsung Internet, iOS Safari, or Firefox the
worker throws mid-parse and the UI wrongly blames the file.

The `legacy/` build bundles core-js and installs polyfills into **whichever scope loads
it — main thread and worker**. A main-thread-only polyfill cannot fix the worker; it is
a separate realm. This is pinned by `src/lib/pdf/pdfjsBuild.test.ts`, which fails the
build if any source file imports bare `pdfjs-dist`.

### Classic workers for iOS Safari

`worker: { format: 'iife' }` plus `?worker&inline` produce a same-origin `blob:` classic
worker, avoiding pdf.js's internal `new Worker(url, { type: 'module' })`, which is
unreliable on iOS.

> ⚠️ **This applies only to production builds.** Vite's dev server always serves module
> workers. Verify iOS against `npm run preview -- --host`, never `npm run dev`.

There is **no CDN fallback**. v1 silently fell back to cdnjs, which broke offline use and
quietly defeated the privacy guarantee. Failing loudly is correct.

---

## Printing

Pure CSS. `PrintSheet` renders into a portal on `<body>`, and print CSS hides everything
else with `body > *:not(#print-root)`. The column count and page geometry come from the
template settings via CSS custom properties, so **the layout setting genuinely controls
paper output** — v1 hard-forced two columns regardless of what was selected.

`@page` honours the chosen paper size (A4 / Letter) and margin.

---

## Data & privacy

- PDFs are parsed in the browser. **No file, address, or phone number is ever uploaded.**
- Batches and settings persist in **IndexedDB on the device only**.
- **Clear local data** (Label template screen) erases everything — use it when handing a
  shared warehouse machine over.

> ⚠️ iOS Safari evicts site storage after ~7 days of inactivity. On iPad/iPhone pack
> stations, treat local persistence as a convenience, not a guarantee.

---

## Deployment

Static site. `netlify.toml` builds with `npm run build` and publishes `dist/`.
`public/_headers` sets security and cache headers.

Installable as a PWA: Chrome/Edge show an install button; on iOS use
**Share → Add to Home Screen**.

---

## Documentation

| File | Contents |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | Hard constraints for anyone (human or agent) editing this repo |
| [PROJECT_SPEC.md](./PROJECT_SPEC.md) | Analysis of the v1 codebase this replaced — historical |
| [ENGINEERING_PLAN.md](./ENGINEERING_PLAN.md) | Architecture and roadmap for the rebuild |
