# Vape de France — QR Shipping Label Generator

Turn an Amazon packing-slip PDF into ready-to-print QR shipping labels, entirely in the browser.

Upload a multi-page Amazon packing slip, and the app extracts each recipient's address and
order number, then renders one printable label per page with a QR code encoding the order number.

> **Your PDFs never leave your device.** All parsing happens client-side — there is no
> upload, no server, and no network request involved in processing.

---

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:5173/**

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run oxlint |

**Requires** Node 20.19+ or 22.12+ (Vite 8). Verified on Node 22 and 25.

---

## How it works

```
Amazon PDF  →  extract text per page  →  parse fields  →  render labels  →  print
   │                    │                      │                │             │
   │              pdfjs-dist            regex rules        QR (SVG)      CSS @media print
   └──────────────── all in the browser, nothing uploaded ─────────────────────┘
```

1. **Upload** — drag and drop, or click to browse. One packing slip per PDF page.
2. **Parse** — text is extracted with `pdfjs-dist` and grouped into visual lines by
   Y-coordinate, then matched against the French Amazon packing-slip layout
   (`Numéro de la commande`, `Adresse d'expédition`, `N° portable`).
3. **Review** — edit, delete, or hand-add labels. Click a QR code for full order details.
4. **Print** — `Ctrl/Cmd+P` or the Print button. Labels print 2-up and never split across pages.

The QR code contains **only the order number** (e.g. `405-1234567-8901234`).

---

## Features

- Drag-and-drop or click-to-browse PDF upload
- Automatic extraction of recipient name, address, country, phone, and order number
- One QR label per PDF page
- Inline editing of any label
- Add labels manually
- 1-column / 2-column layout toggle
- Print-optimised CSS (2-up, page-break safe, SVG QR codes scale to printer DPI)
- Fully responsive — works on desktop and mobile
- Works on iOS Safari (see [Browser support](#browser-support))

---

## Project structure

```
src/
├── main.jsx                  # Math.sumPrecise polyfill + React root
├── App.jsx                   # re-export shim
├── index.css                 # label styles + print rules
├── components/
│   ├── App.jsx               # all state, upload screen, toolbar
│   ├── Header.jsx            # sticky brand bar
│   ├── LabelSheet.jsx        # grid wrapper
│   ├── LabelCard.jsx         # one printable label
│   ├── ProductModal.jsx      # order detail sheet
│   └── EditLabelModal.jsx    # edit form
└── utils/
    └── pdfParser.js          # PDF text extraction + field parsing
```

📄 **For full technical detail** — data model, every parsing rule, known bugs, and
architecture notes — see **[PROJECT_SPEC.md](./PROJECT_SPEC.md)**.

🛠 **For the v2 rebuild plan** — stack decisions, roadmap, and quality gates — see
**[ENGINEERING_PLAN.md](./ENGINEERING_PLAN.md)**.

---

## Tech stack

| | |
|---|---|
| **Framework** | React 19 |
| **Build** | Vite 8 |
| **PDF parsing** | pdfjs-dist 6 |
| **QR codes** | qrcode.react (SVG) |
| **Icons** | lucide-react |
| **Styling** | Inline styles + `index.css` (Tailwind v4 installed, used for base reset) |
| **Hosting** | Netlify |

---

## Browser support

Works on Chrome, Edge, Firefox, and Safari — desktop and mobile.

**iOS Safari** required three specific workarounds, all in the codebase:

1. **`Math.sumPrecise` polyfill** (`src/main.jsx`) — pdfjs v6 uses it; it ships only in
   Chrome 137+. Implemented with Neumaier compensated summation.
2. **Classic (non-module) workers** (`vite.config.js` → `worker.format: 'iife'`) — iOS
   Safari's ESM worker support is unreliable.
3. **Manual worker construction** (`src/utils/pdfParser.js`) — the worker is created
   explicitly and passed to `pdfjsLib.PDFWorker({ port })`, bypassing pdfjs's internal
   module-worker call.

> ⚠️ **Workarounds 1 and 2 only take effect in a production build.** Vite's dev server
> always serves module workers, so testing PDF upload on iOS against `npm run dev` does
> **not** exercise the real code path. Verify iOS with:
> ```bash
> npm run build && npm run preview -- --host
> ```

---

## Deployment

Deploys to Netlify as a static site. Configuration lives in `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

`public/_headers` adds security headers (`X-Frame-Options`, `X-Content-Type-Options`)
and long-lived cache headers for hashed assets.

---

## Known issues

Read these before relying on output for real shipments.

| Issue | Impact |
|---|---|
| ⚠️ **Fabricated order numbers** | If a page's order number can't be parsed, the app generates a **random** one rather than failing. Only one valid page is needed to accept the whole PDF — so in a large batch, some labels may carry invented numbers that look real. **Always spot-check before shipping.** |
| ⚠️ **Unlisted countries default to France** | The country list is hardcoded to 9 values. A destination outside it (Netherlands, Poland, Ireland…) silently prints as `FRANCE`. |
| ⚠️ **`pdfjs-dist` needs updating** | The pinned version is below the fix for a known vulnerability (arbitrary JS execution when opening a malicious PDF). Run `npm audit fix`. |
| **No persistence** | A page refresh clears all labels. There is no autosave. |
| **Empty error message** | Selecting a non-PDF file shows an error box with no text in it. |
| **Print ignores column toggle** | Printing always uses 2 columns regardless of the on-screen setting. |

Full analysis with severities and fixes: [PROJECT_SPEC.md § 13](./PROJECT_SPEC.md).

---

## Notes

- The parser targets the **French** Amazon packing-slip layout, with partial English
  fallbacks (`Ship To`, `Order ID`, `Phone`).
- Each PDF page is treated as exactly one packing slip.
- Labels exist only in memory — nothing is stored or transmitted.
