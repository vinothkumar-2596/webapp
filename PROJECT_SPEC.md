# Vape de France — Amazon PDF → QR Shipping Label Generator

> ## ⚠️ HISTORICAL DOCUMENT
>
> This describes **v1**, the codebase that has since been replaced by the
> TypeScript rebuild in this repository. It is kept as the record of what the
> original did and which defects the rebuild set out to fix.
>
> For the current system, see [README.md](./README.md) and [CLAUDE.md](./CLAUDE.md).

## Complete Technical Specification

> **Purpose of this document:** a full, self-contained reference for the existing
> application — architecture, data model, parsing logic, component contracts,
> styling, build config, and every known defect. Written so the app can be
> rebuilt, extended, or ported without reading the original source.
>
> Generated 2026-08-21 · Source: `label-generator-main` · Verified against a live dev server.

---

## Table of contents

1. [What the application does](#1-what-the-application-does)
2. [Tech stack](#2-tech-stack)
3. [Directory structure](#3-directory-structure)
4. [Architecture & data flow](#4-architecture--data-flow)
5. [The Label data model](#5-the-label-data-model)
6. [PDF parsing pipeline](#6-pdf-parsing-pipeline-deep-dive)
7. [Component reference](#7-component-reference)
8. [State management](#8-state-management)
9. [Design system](#9-design-system)
10. [Print system](#10-print-system)
11. [Browser compatibility & the iOS Safari strategy](#11-browser-compatibility--the-ios-safari-strategy)
12. [Build & deployment](#12-build--deployment)
13. [Known bugs](#13-known-bugs)
14. [Dead code & cleanup list](#14-dead-code--cleanup-list)
15. [Security](#15-security)
16. [Rebuild recommendations](#16-rebuild-recommendations)
17. [Appendix: full regex cheatsheet](#17-appendix-full-regex-cheatsheet)

---

## 1. What the application does

A **100% client-side** React SPA. The user drops in an **Amazon packing-slip PDF**
(one packing slip per page). The app:

1. Parses the PDF **in the browser** — no upload, no backend, no network call.
2. Extracts, per page, the recipient address, phone, order number, and product info.
3. Renders one **printable QR shipping label** per page.
4. Lets the user edit, delete, or hand-add labels.
5. Prints via the browser's native print dialog (CSS-driven, 2-up on paper).

The QR code encodes **only the order number** (e.g. `405-1234567-8901234`) — nothing else.

**Locale.** The parser targets the **French** Amazon packing-slip layout
(`Numéro de la commande`, `Adresse d expédition`, `N° portable`), with partial English
fallbacks (`Ship To`, `Order ID`, `Phone`). UI copy is mixed English/French.

**Critical property.** State lives **entirely in memory**. A page refresh loses every
label. There is no persistence layer of any kind — no localStorage, no IndexedDB, no server.

---

## 2. Tech stack

| Layer | Choice | Version |
|---|---|---|
| Framework | React | `^19.2.7` |
| Build tool | Vite | `^8.1.1` (ran as 8.1.5) |
| React plugin | `@vitejs/plugin-react` | `^6.0.3` (Oxc-based) |
| CSS | Tailwind CSS v4 via `@tailwindcss/vite` | `^4.3.3` |
| PDF engine | `pdfjs-dist` | `^6.1.200` |
| QR codes | `qrcode.react` (`QRCodeSVG`) | `^4.2.0` |
| Icons | `lucide-react` | `^1.25.0` |
| Linter | `oxlint` | `^1.71.0` |
| Host | Netlify (static) | — |

**Declared but never imported (dead dependencies):** `html2canvas`, `jspdf`.
Printing is pure CSS — neither library is involved anywhere in the codebase.

**Runtime verified on:** Node v25.2.1, npm 10.2.5. Install is 75 packages, ~13 s.

### Scripts

```bash
npm install     # install dependencies
npm run dev     # Vite dev server → http://localhost:5173/
npm run build   # production build → dist/
npm run preview # serve the production build locally
npm run lint    # oxlint
```

---

## 3. Directory structure

```
label-generator-main/
├── index.html                  # entry HTML, Google Fonts, <div id="root">
├── vite.config.js              # react + tailwind plugins, worker format, optimizeDeps
├── netlify.toml                # SPA redirect, build cmd, cache headers
├── package.json
├── .oxlintrc.json              # react/rules-of-hooks, react/only-export-components
├── .gitignore
├── README.md                   # (!) still the stock Vite template README
├── public/
│   ├── favicon.svg             # (!) stock Vite purple logo, not branded
│   ├── icons.svg               # (!) unused template social icons
│   └── _headers                # Netlify headers (duplicates netlify.toml)
└── src/
    ├── main.jsx                # Math.sumPrecise polyfill + createRoot + StrictMode
    ├── App.jsx                 # 2-line re-export shim → components/App
    ├── index.css               # Tailwind import + label/print CSS  ← THE REAL STYLESHEET
    ├── App.css                 # (!) 184 lines of stock Vite CSS, NEVER IMPORTED
    ├── assets/
    │   ├── hero.png            # (!) unused template asset
    │   ├── react.svg           # (!) unused
    │   └── vite.svg            # (!) unused
    ├── components/
    │   ├── App.jsx             # 457 lines — ALL state, upload UI, toolbar
    │   ├── Header.jsx          #  83 — sticky brand bar
    │   ├── LabelSheet.jsx      #  20 — grid wrapper
    │   ├── LabelCard.jsx       # 105 — one printable label
    │   ├── ProductModal.jsx    #  89 — read-only detail sheet
    │   ├── EditLabelModal.jsx  # 159 — edit form
    │   └── FileUploadModal.jsx # 160 — (!) DEAD CODE, never imported
    └── utils/
        └── pdfParser.js        # 275 — pdfjs worker setup + all parsing logic
```

**Total ~1,190 lines of live source.** Roughly 350 lines are dead or template leftovers.

---

## 4. Architecture & data flow

```
index.html
  └─ src/main.jsx ............... Math.sumPrecise polyfill, createRoot, <StrictMode>
       └─ src/App.jsx ........... re-export shim (no logic)
            └─ components/App.jsx  ◀── SINGLE SOURCE OF TRUTH (every useState lives here)
                 ├─ Header ............... labelCount
                 ├─ [upload screen]  ..... rendered when labels.length === 0
                 │     └─ drop zone → processFile() → parsePdfToLabels()
                 ├─ [label sheet]    ..... rendered when labels.length > 0
                 │     ├─ toolbar ........ Add / Print / Clear / 1-col / 2-col
                 │     └─ LabelSheet
                 │           └─ LabelCard ×N
                 ├─ ProductModal ......... opened by clicking a QR code
                 └─ EditLabelModal ....... opened by Add or the pencil icon
```

There is **no router** — the upload screen and the label sheet are a single ternary on
`labels.length`. There is no context, no reducer, no state library.

### Flow: PDF → labels

```
File (drag-drop or file input)
  │
  ├─ extension / MIME check .............. App.jsx  processFile()
  ▼
parsePdfToLabels(file) ................... pdfParser.js
  │
  ├─ extractPdfPagesText(file)
  │     ├─ size === 0?  → throw EMPTY_FILE
  │     ├─ File.arrayBuffer()   (FileReader fallback for old iOS)
  │     ├─ magic bytes !== "%PDF"? → throw NOT_PDF
  │     ├─ loadDocument() → pdfjs with an explicit blob-URL worker
  │     └─ per page: getTextContent() → group items into visual lines
  │           returns [{ pageNumber, rawText, lines[] }]
  │
  ├─ .map(parseAmazonPackingSlip)  → Label[]
  │
  └─ zero labels with a real order number? → throw INVALID_PDF
  ▼
setLabels(Label[]) → re-render as the label sheet
```

**No async state machine and no cancellation.** A second upload while one is in flight
will race; `isLoading` is a plain boolean and the later `setLabels` wins arbitrarily.

---

## 5. The Label data model

The canonical object produced by the parser and consumed by every component:

```js
{
  id: "label-1755800000000-0-x7f2p",   // `label-${Date.now()}-${index}-${base36(5)}`
  pageNumber: 1,                        // 1-based source PDF page

  // ── Address block ──
  recipientName: "avila francis",       // falls back to `Customer ${index+1}`
  addressLines: [                       // raw lines — MAY INCLUDE the country line
    "12 rue de la Paix",
    "75002 Paris",
    "France"
  ],
  postalCode: "75002",                  // (!) parsed but NEVER RENDERED anywhere
  city: "Paris",                        // (!) parsed but NEVER RENDERED anywhere
  country: "France",                    // matched against a hardcoded 9-country list
  phone: "0612345678",                  // "" when not found

  // ── Order ──
  orderNumber: "405-1234567-8901234",   // (!) RANDOM FAKE when not found in the PDF
  _hasRealOrderNumber: true,            // internal flag; true only if genuinely extracted

  // ── Product ──
  productDetails: {
    title:    "Product details from invoice",  // line after the Quantité header, ≤120 chars
    sku:      "SKU-DEFAULT",
    asin:     "ASIN-DEFAULT",
    quantity: "1",                      // (!) HARDCODED — never parsed from the PDF
    vendor:   "Amazon Marketplace"
  }
}
```

### Field usage matrix

| Field | Set by parser | Editable in UI | Rendered on label | Rendered in modal |
|---|:--:|:--:|:--:|:--:|
| `recipientName` | ✅ | ✅ | ✅ | ✅ |
| `addressLines` | ✅ | ✅ (textarea) | ✅ | ✅ |
| `country` | ✅ | ❌ | ✅ (uppercase) | ❌ |
| `phone` | ✅ | ✅ | ✅ | ✅ |
| `orderNumber` | ✅ | ✅ | QR + tooltip | ✅ |
| `postalCode` | ✅ | ❌ | ❌ | ❌ |
| `city` | ✅ | ❌ | ❌ | ❌ |
| `productDetails.title` | ✅ | ✅ | ❌ | ✅ |
| `productDetails.sku` | ✅ | ✅ | ❌ | ✅ |
| `productDetails.asin` | ✅ | ⚠️ in form state, **no input rendered** | ❌ | ✅ |
| `productDetails.quantity` | hardcoded | ❌ | ❌ | ✅ |
| `productDetails.vendor` | ✅ | ❌ | ❌ | ✅ |

`postalCode` and `city` are pure dead weight today. `productDetails.price` is
initialised inside the parser and then **dropped from the return object**.

### Shape inconsistency between the two creation paths

`handleAddLabel()` in `App.jsx` builds a **different shape** than the parser:

| Field | From parser | From "Add" button |
|---|---|---|
| `id` | `label-${ts}-${i}-${rand}` | `m-${Date.now()}` |
| `postalCode` | ✅ present | ❌ **missing** |
| `city` | ✅ present | ❌ **missing** |
| `_hasRealOrderNumber` | ✅ present | ❌ **missing** |
| `productDetails.vendor` | ✅ present | ❌ **missing** |

Two labels added in the same millisecond would also collide on `id`.

---

## 6. PDF parsing pipeline (deep dive)

### 6.1 Stage 1 — text extraction into visual lines

`extractPdfPagesText(fileOrBuffer)` — `src/utils/pdfParser.js:56`

PDF text is a bag of positioned glyph runs, not lines. The reconstruction algorithm:

```js
for (const item of textContent.items) {
  if (!item.str || !item.str.trim()) continue;
  const y = Math.round(item.transform[5] / 4) * 4;   // snap Y to a 4pt grid
  if (!lineMap.has(y)) lineMap.set(y, []);
  lineMap.get(y).push({ x: item.transform[4], text: item.str });
}

const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);   // top → bottom
const pageLines = sortedY.map(y =>
  lineMap.get(y)
    .sort((a, b) => a.x - b.x)          // left → right
    .map(it => it.text)
    .join(' ')                          // joined with a SPACE
);
```

**Design notes and limits:**

- The **4-point Y tolerance** is the single most important tuning constant. Too small
  and one visual line splits into several; too large and adjacent lines merge.
  Superscripts and mixed font sizes can land on the wrong side of it.
- Joining runs with `' '` **inserts spaces that were not in the original text**. Kerned
  words can emerge as `Pa ris`. Every downstream regex must tolerate stray whitespace.
- Multi-column layouts are flattened left-to-right into a single line — an address in a
  right-hand column gets interleaved with left-column text at the same height.
- Rotated text, and text rendered as vector outlines or as a scanned image, produce
  **no text items at all**. There is no OCR fallback.

Output per page: `{ pageNumber, rawText /* lines joined by \n */, lines: string[] }`

### 6.2 Stage 2 — field extraction

`parseAmazonPackingSlip(pageData, index)` — `src/utils/pdfParser.js:128`

Every extraction rule, exactly as implemented:

| # | Field | Pattern / heuristic | Fallback |
|---|---|---|---|
| 1 | **Order number** | `(?:Numéro de la commande\|Order ID\|Commande nº)[\s:]*([0-9]{3}-[0-9]{7}-[0-9]{7})` | then bare `([0-9]{3}-[0-9]{7}-[0-9]{7})`; else **random fake** |
| 2 | **Phone** | `(?:N°\s*portable\|Téléphone\|Phone\|Tél)[\s:]*([0-9+\s.()-]{8,20})` | `""` |
| 3 | **Address anchor** | line index matching `Adresse d expédition` \| `Ship To` \| `Livrer à` | postal-code scan (3d) |
| 3a | **Address block** | the **next 6 lines** after the anchor, minus lines matching `Numéro de la commande\|Date de commande\|Merci pour votre achat\|Quantité\|Détails` | — |
| 3b | → `recipientName` | `cleanAddr[0]`, leading `-` `•` and spaces stripped | `Customer ${index+1}` |
| 3c | → `addressLines` | `cleanAddr.slice(1)` | `['Address Line 1','City / Country']` |
| 3d | **Fallback anchor** | first line matching `^[0-9]{4,5}\s+[A-Za-z\s-]+`; name = 2 lines above, address = 1 above → 2 below | — |
| 4 | **Country** | first address line matching `^(France\|Espagne\|Spain\|Belgique\|Deutschland\|Italy\|Italie\|Portugal\|United Kingdom)` | `"France"` |
| 5 | **Postal + city** | first address line matching `\b([0-9]{5})\s+(.+)` | `""`, `""` |
| 6 | **ASIN** | `ASIN\s*:?\s*([A-Z0-9]{10})` | `"ASIN-DEFAULT"` |
| 7 | **SKU** | `SKU\s*:?\s*([^\n\r]+)` — **greedy to end of line** | `"SKU-DEFAULT"` |
| 8 | **Title** | the line **after** the first line matching `Quantité\|Détails de l article\|Prix`, truncated to 120 chars | `"Product details from invoice"` |
| 9 | **Quantity** | ❌ **never parsed** | always `"1"` |

**Known weaknesses in these rules:**

- Rule 4's country list is 9 hardcoded values. Anything else (Netherlands, Poland,
  Ireland, Switzerland…) silently defaults the label to **`France`** — a wrong country
  printed on a real parcel.
- Rule 5 requires exactly 5 digits, so it misses 4-digit postcodes even though rule 3d
  accepts `{4,5}`.
- Rule 7 is greedy: it captures everything to end of line, so a SKU followed by other
  column text on the same reconstructed line swallows that text too.
- Rule 3a's fixed 6-line window breaks on addresses longer than 5 lines, or when a
  company name adds a line.

### 6.3 The silent-failure problem

Almost every rule above has a **cosmetic** fallback. If Amazon changes the layout, the
parser does not fail — it emits labels reading `Customer 1` / `Address Line 1` /
`City / Country` with a **randomly generated order number**, and those get printed
onto real parcels. The only hard gate in the whole pipeline is rule #1.

### 6.4 Stage 3 — document validation

`parsePdfToLabels(file)` — `src/utils/pdfParser.js:253`

```js
const validCount = labels.filter(l => l._hasRealOrderNumber).length;
if (validCount === 0) {
  const err = new Error('Ce PDF ne contient aucun « Numéro de la commande ». …');
  err.code = 'INVALID_PDF';
  throw err;
}
return labels;   // (!) ALL labels returned, including the invalid ones
```

**One valid page validates the entire document.** A 50-page PDF where only page 1 has a
recognisable order number passes validation, and pages 2–50 ship with fabricated numbers.

### 6.5 Error codes

| `err.code` | Thrown when | UI treatment |
|---|---|---|
| `EMPTY_FILE` | `File.size === 0` (iCloud file not yet downloaded on iOS) | amber "PDF invalide" |
| `NOT_PDF` | first 4 bytes ≠ `%PDF` (`0x25 0x50 0x44 0x46`) | amber "PDF invalide" |
| `INVALID_PDF` | no page had a real order number | amber "PDF invalide" |
| *(none)* | any other throw — corrupt PDF, worker failure | red "Erreur de lecture" |

All three amber cases are handled by three identical branches at `App.jsx:63-68`;
they collapse to one condition.

---

## 7. Component reference

### `main.jsx`

Installs the `Math.sumPrecise` polyfill (see §11), then mounts `<App />` inside
`<StrictMode>` on `#root`.

### `App.jsx` (shim) — `src/App.jsx`

```js
import App from './components/App';
export default App;
```

Two lines. Exists only so `main.jsx` can import `./App.jsx`. **Removable.**

### `components/App.jsx` — 457 lines

The whole application. Holds every piece of state, both screens, all handlers, and all
inline styling.

**Internal hook:**

```js
function useIsMobile() {   // breakpoint: 640px
  const [mobile, setMobile] = React.useState(() => window.innerWidth < 640);
  React.useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 640);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}
```

Note: unthrottled resize handler; fires on every resize event.

**Handlers:**

| Handler | Behaviour |
|---|---|
| `processFile(file)` | extension/MIME guard → `parsePdfToLabels` → `setLabels`, with error mapping |
| `handleDragOver/Leave/Drop` | drop-zone visual state + `processFile` on drop |
| `handleDelete(id)` | `setLabels(p => p.filter(l => l.id !== id))` |
| `handleSave(updated)` | `setLabels(p => p.map(l => l.id === updated.id ? updated : l))` |
| `handleAddLabel()` | prepends a placeholder label and opens the edit modal |
| Print | `window.print()` |
| Clear | `window.confirm('Clear all labels?')` → `setLabels([])` |

**Screen A — upload** (`labels.length === 0`): a centred card, max-width 520 px, with a
header, a 4-step "How it works" list, a drag-and-drop zone with a hidden
`<input type="file" accept=".pdf,application/pdf">`, and a conditional error alert.

**Screen B — label sheet** (`labels.length > 0`): a `no-print` toolbar (label count,
Add, Print, Clear, 1-col/2-col toggle) above a white panel containing `<LabelSheet>`.
Add and the column toggle are **hidden on mobile**.

### `components/Header.jsx` — 83 lines

**Props:** `{ labelCount: number }`

Sticky (`top: 0`, `z-index: 30`), 56 px tall, max-width 1280. Shows a green
`ShoppingBag` tile, the wordmark `VAPE DE FRANCE` (with `DE FRANCE` in `#10B981`), a
`QR Labels` pill hidden below 380 px via `.hidden-xs`, and a right-side label count that
renders only when `labelCount > 0`. Hidden entirely in print.

### `components/LabelSheet.jsx` — 20 lines

**Props:** `{ labels, onSelectProduct, onEditLabel, onDeleteLabel, gridCols = 2 }`

Pure layout. Wraps everything in `<div id="printable-label-sheet">` and applies
`label-sheet-grid` plus `--2col` or `--1col`. Maps `labels` to `<LabelCard>` keyed by
`label.id`.

### `components/LabelCard.jsx` — 105 lines

**Props:** `{ label, onSelectProduct, onEditLabel, onDeleteLabel }`

The printable unit. Layout is a horizontal flex row:

- **Left — address block.** Recipient name prefixed with `- ` and **lowercased**
  (`- avila francis`). Then `addressLines`, **skipping any line equal to `country`**
  (case-insensitive) so the country is not duplicated. Then `country` in **UPPERCASE**,
  weight 900. Then `N° portable : {phone}` when present.
- **Right — QR.** `QRCodeSVG` with `value = label.orderNumber || 'N/A'`, `size={70}`,
  `level="M"`, `includeMargin`, sized responsively via
  `clamp(56px, 16vw, 76px)`. Clicking calls `onSelectProduct(label)`.
- **Overlay — edit/delete.** Absolutely positioned bottom-right, `no-print`, hidden by
  `opacity: 0` and revealed by JS-attached `mouseenter`/`mouseleave` listeners on the
  parent `.group`. **This leaks listeners — see §13.2.**

Typography uses `clamp()` throughout so cards scale with the viewport.

### `components/ProductModal.jsx` — 89 lines

**Props:** `{ label, onClose }` — returns `null` when `label` is falsy.

A **bottom sheet** (`align-items: flex-end`, top corners rounded 20 px, `max-height: 90dvh`).
Contains a green header with the order number, a larger QR (`size={72}`, `level="H"`), a
"QR Verified" badge, the product title and vendor, a 2×2 spec grid (SKU, ASIN, Qty,
Source), and a delivery-address block.

**Accessibility gaps:** no `Escape` handler, **no backdrop-click-to-close** (unlike
`EditLabelModal`), no focus trap, no ARIA role.

### `components/EditLabelModal.jsx` — 159 lines

**Props:** `{ label, isOpen, onClose, onSave }`

A **centred** modal with a controlled form. Local `form` state is synced from `label`
via `useEffect`. `addressLines` is edited as a newline-joined textarea and split back on
save, dropping blank lines.

**Fields rendered:** Recipient Name (required), Address Lines (required textarea),
Phone, Order Number, SKU, Product Title.

**Not editable:** `country`, `postalCode`, `city`, `quantity`, `vendor`.
`asin` is held in form state but **has no input rendered** — it round-trips unchanged.

Closes on backdrop click. No `Escape` handler, no focus trap.

### `components/FileUploadModal.jsx` — 160 lines — DEAD CODE

Never imported. A superseded earlier version of the upload flow, still referencing an
`onLoadSample` demo feature that no longer exists anywhere in the codebase. It is also
the **only** file that uses Tailwind utility classes. Delete it.

---

## 8. State management

All state is `useState` in `components/App.jsx`:

| State | Type | Purpose |
|---|---|---|
| `labels` | `Label[]` | the entire document |
| `selectedLabel` | `Label \| null` | drives `ProductModal` |
| `editingLabel` | `Label \| null` | drives `EditLabelModal` |
| `gridCols` | `1 \| 2` | on-screen column count |
| `isDragging` | `boolean` | drop-zone highlight |
| `isLoading` | `boolean` | parsing spinner |
| `uploadError` | `string \| {type,message} \| null` | ⚠️ **two incompatible shapes** — see §13.1 |

`gridCols` initialises to `isMobile ? 1 : 2` and is forced to `1` by an effect whenever
`isMobile` becomes true. `LabelSheet` additionally receives `isMobile ? 1 : gridCols`,
so the mobile clamp is applied twice.

**No persistence.** Adding `localStorage` sync on `labels` would be a ~5-line change and
the single highest-value improvement to the app.

---

## 9. Design system

### Colour tokens (hardcoded, not centralised)

| Token | Value | Use |
|---|---|---|
| `EM` | `#10B981` | primary emerald — buttons, accents, icons |
| `EMH` | `#059669` | hover state |
| page background | `#EEF2FF` | set in `index.css` **and** inline in `App.jsx` |
| card surface | `#FFFFFF` | panels, modals |
| card border | `#E0E0DE` | panel borders |
| label surface | `#FAFAF8` | `.label-card` background |
| label border | `#D5D5D3` | `.label-card` border |
| text primary | `#111827` | headings |
| text secondary | `#374151` | body |
| text muted | `#9CA3AF` | hints |
| warning | `#F59E0B` / `#FFFBEB` / `#92400E` | "PDF invalide" alert |
| danger | `#DC2626` / `#FFF1F0` / `#FECDD3` | "Erreur de lecture" alert |

⚠️ `index.html` sets `body { background-color: #F4F4F2 }` inline while `index.css` sets
`#EEF2FF` — a brief flash of the wrong colour on first paint.

### Typography

Loaded from Google Fonts in `index.html`:

- **Outfit** (400–900) — display/headings, via `.font-display` or inline `fontFamily`
- **Poppins** (300–700) — body, set on `body` in `index.css`
- **Arial/Helvetica** — forced on `.label-card` for print consistency

### Styling approach — and the Tailwind contradiction

Every live component styles via **inline `style={{}}` objects**. Tailwind v4 is
installed, configured as a Vite plugin, and imported (`@import "tailwindcss"`), but the
**only** file using Tailwind utility classes is the dead `FileUploadModal.jsx`.

In practice Tailwind provides just the base reset and `@layer base`. You are paying for
the Tailwind build step to get a CSS reset. **Either commit to Tailwind and convert the
inline styles, or drop Tailwind and keep a small hand-written reset.**

### The real stylesheet — `src/index.css` (79 lines)

Defines `.label-card` and its `__address` / `__qr` children, `.label-sheet-grid` with
`--2col` / `--1col` modifiers, a 640 px media query collapsing 2-col to 1-col, and the
entire print block.

---

## 10. Print system

Pure CSS. The Print button is literally `onClick={() => window.print()}`.

```css
@media print {
  body { background: #fff !important; }
  header, .no-print { display: none !important; }
  .label-sheet-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 6px !important; }
  .label-card {
    box-shadow: none !important;
    border: 1px solid #aaa !important;
    background: #fff !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .label-card__qr .scan-hint { display: none !important; }
  #printable-label-sheet { padding: 0 !important; margin: 0 !important; }
}
```

**Behaviours worth knowing:**

- Print **always forces 2 columns**, ignoring the on-screen `gridCols` toggle. If a user
  picks 1-col and prints, they still get 2-up.
- `break-inside: avoid` (plus the legacy `page-break-inside`) keeps a label from
  splitting across pages.
- `.scan-hint` is targeted but **no element with that class exists** — a leftover rule.
- There is **no `@page` rule** — no margin, size, or orientation control. Physical output
  depends entirely on the browser's print dialog defaults.
- `.no-print` hides the toolbar and the per-card edit/delete overlay.
- QR codes are **SVG**, so they scale to printer DPI without pixelation. This is the
  right choice and should be preserved in any rebuild.

---

## 11. Browser compatibility & the iOS Safari strategy

This is the most deliberate engineering in the codebase — three coordinated
workarounds for running `pdfjs-dist` v6 on iOS Safari.

### 11.1 Classic (non-module) workers — `vite.config.js`

```js
worker: { format: 'iife' }
```

iOS Safari's support for ESM workers (`new Worker(url, { type: 'module' })`) is limited
to iOS 15+ and unreliable even there. `iife` emits a classic script worker instead.

### 11.2 Manual worker construction — `pdfParser.js:17-37`

```js
import PdfWorkerInline from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';

let _pdfWorker = null;

function getPdfWorker() {
  if (_pdfWorker && !_pdfWorker.destroyed) return _pdfWorker;
  try {
    const jsWorker = new PdfWorkerInline();                    // classic blob-URL worker
    _pdfWorker = new pdfjsLib.PDFWorker({ port: jsWorker });    // hand the port to pdfjs
    return _pdfWorker;
  } catch (err) {
    // Fallback: CDN workerSrc (requires network)
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    return null;
  }
}
```

`?worker&inline` makes Vite embed the worker as a same-origin `blob:` URL inside the main
bundle — no separate worker file to serve. Passing `{ port }` to `PDFWorker` bypasses
pdfjs's internal `new Worker(url, { type: 'module' })`. The worker is cached in a
module-level singleton and reused across document loads.

> ⚠️ **The CDN fallback is a privacy/availability regression.** The app's core selling
> point is that PDFs never leave the device; if the inline worker fails, it silently
> starts loading executable code from `cdnjs.cloudflare.com`. It also breaks offline use.

### 11.3 `Math.sumPrecise` polyfill — `main.jsx:4-18`

pdfjs v6 calls `Math.sumPrecise`, which only ships in Chrome 137+. The polyfill uses
**Neumaier compensated summation**, matching the spec's precision guarantee:

```js
if (typeof Math.sumPrecise !== 'function') {
  Math.sumPrecise = function (values) {
    let sum = 0, compensation = 0;
    for (const v of values) {
      const t = sum + v;
      compensation += Math.abs(sum) >= Math.abs(v) ? (sum - t) + v : (v - t) + sum;
      sum = t;
    }
    return sum + compensation;
  };
}
```

### 11.4 ⚠️ The iOS strategy does not apply in dev — verified

Vite's dev server does not bundle workers. Requesting the inline-worker module from a
running dev server returns:

```js
export default function WorkerWrapper(options) {
  return new Worker(
    "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?worker_file&type=module",
    { type: "module", name: options?.name }
  );
}
```

`type: "module"` — exactly what §11.1 and §11.2 exist to avoid. **`worker.format: 'iife'`
only takes effect during `vite build`.**

**Consequence:** testing PDF upload from an iPhone against `npm run dev` does *not*
exercise the production code path. Always verify iOS with:

```bash
npm run build && npm run preview -- --host
```

### 11.5 Other compatibility measures

- `File.arrayBuffer()` wrapped in `try/catch` with a `FileReader` fallback for old iOS.
- Explicit `File.size === 0` guard — iOS returns an empty `File` for iCloud documents
  that have not been downloaded to the device.
- `WebkitOverflowScrolling: 'touch'` on both modals.
- `maxHeight: '90dvh'` (dynamic viewport units) so modals account for mobile browser chrome.
- `WebkitTapHighlightColor: 'transparent'` on the drop zone.

---

## 12. Build & deployment

### `vite.config.js`

```js
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ['pdfjs-dist'] },   // keep pdfjs out of dep pre-bundling
  worker:       { format: 'iife' },            // classic workers for iOS Safari
})
```

### `netlify.toml`

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200          # SPA fallback

[build]
  command = "npm run build"
  publish = "dist"

[[headers]]             # /assets/*      → immutable 1-year cache
[[headers]]             # /assets/*.mjs  → Content-Type: application/javascript
[[headers]]             # /assets/*.js   → Content-Type: application/javascript
```

### `public/_headers`

```
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff

/assets/*
  Cache-Control: public, max-age=31536000, immutable
/assets/*.mjs
  Content-Type: application/javascript
/assets/*.js
  Content-Type: application/javascript
```

⚠️ **The cache and content-type rules are declared twice** — in `netlify.toml` and in
`public/_headers`. Netlify merges these with `_headers` taking precedence, but the
duplication is a maintenance trap. Consolidate into one file; keep `_headers` since it
uniquely carries the security headers.

---

## 13. Known bugs

### 13.1 `uploadError` has two incompatible shapes — user-visible

**Severity: high.** `App.jsx:48` and `App.jsx:56` set a bare **string**:

```js
setUploadError('Please upload a valid PDF file.');
```

Every other path sets an **object**, and the renderer at `App.jsx:270-315` reads
`uploadError.type` and `uploadError.message`. On a string, both are `undefined`.

**Result:** selecting a non-PDF file shows a red "Erreur de lecture" box with a
**completely empty body**. The user gets no explanation at all.

**Fix:** always set the object shape.

```js
setUploadError({ type: 'invalid_pdf', message: 'Please upload a valid PDF file.' });
```

### 13.2 Event-listener leak in `LabelCard`

**Severity: medium.** `LabelCard.jsx:78-86`:

```jsx
ref={el => {
  if (!el) return;
  const card = el.closest('.group');
  if (!card) return;
  card.addEventListener('mouseenter', show);   // never removed
  card.addEventListener('mouseleave', hide);   // never removed
}}
```

Listeners are attached on every ref invocation and never removed — twice per mount under
`StrictMode`. This is a hand-rolled `group-hover`.

**Fix:** delete the JS entirely and use CSS.

```css
.label-card .card-actions { opacity: 0; transition: opacity .15s; }
.label-card:hover .card-actions { opacity: 1; }
```

### 13.3 The `Math.sumPrecise` polyfill does not actually run first

**Severity: low (latent).** `main.jsx` places the polyfill textually above the imports,
but ES `import` declarations are **hoisted** — pdfjs's module body evaluates *before*
that line runs. It works today only because pdfjs calls `sumPrecise` at parse time, not
at module-init time. A future pdfjs release that touches it during initialisation would
break Safari with no code change on your side.

**Fix:** move the polyfill into `src/polyfills.js` and make it the **first import** in
`main.jsx`.

### 13.4 `RangeError` on files smaller than 4 bytes

**Severity: low.** `pdfParser.js:86`:

```js
const header = new Uint8Array(arrayBuffer, 0, 4);
```

Throws `RangeError` for any file under 4 bytes, before the friendly `NOT_PDF` message
can fire — the user sees the generic red error instead.

**Fix:** guard with `if (arrayBuffer.byteLength < 4) throw NOT_PDF`.

### 13.5 Dead branch: "No label data found"

**Severity: cosmetic.** `App.jsx:55-57` handles `parsed.length === 0`, but
`parsePdfToLabels` throws `INVALID_PDF` in that case rather than returning `[]`. The
branch is unreachable — and it is also one of the two string-shaped `setUploadError`
calls from §13.1.

### 13.6 Fabricated order numbers ship silently

**Severity: high (business logic).** See §6.3 and §6.4. A partially-parsed PDF produces
labels with random order numbers, indistinguishable from real ones in the UI. These get
printed onto parcels.

**Fix:** propagate `_hasRealOrderNumber` to `LabelCard` and render an unmissable warning
badge; consider blocking print until every label is confirmed.

### 13.7 Modal accessibility

**Severity: medium.** Neither modal has an `Escape` handler, a focus trap, `role="dialog"`,
`aria-modal`, or focus restoration on close. `ProductModal` additionally **cannot be
closed by clicking the backdrop**, unlike `EditLabelModal` — an inconsistency users hit
immediately.

### 13.8 `id` collision on rapid Add

**Severity: low.** `handleAddLabel` uses `m-${Date.now()}`. Two labels added within the
same millisecond collide, and React keys plus `handleDelete`/`handleSave` all key off
`id`. Use `crypto.randomUUID()`.

### 13.9 Unthrottled resize handler

**Severity: low.** `useIsMobile` calls `setMobile` on every resize event. Debounce, or
use `window.matchMedia('(max-width: 639px)')` with a `change` listener.

---

## 14. Dead code & cleanup list

Safe to delete — none of this is reachable:

| Path | Lines | Note |
|---|---|---|
| `src/components/FileUploadModal.jsx` | 160 | never imported; references a removed demo feature |
| `src/App.css` | 184 | stock Vite template CSS; never imported |
| `src/assets/hero.png` | — | unused template asset |
| `src/assets/react.svg` | — | unused |
| `src/assets/vite.svg` | — | unused |
| `public/icons.svg` | — | unused template social icons |
| `src/App.jsx` | 2 | pointless re-export shim |
| `html2canvas` dependency | — | never imported |
| `jspdf` dependency | — | never imported |
| `.scan-hint` print rule | 1 | no matching element exists |
| `productDetails.price` | 1 | initialised, then dropped from the return object |

Also needing attention:

- **`README.md`** is still the stock Vite template README — nothing about this app.
- **`public/favicon.svg`** is the purple Vite logo, not Vape de France branding.
- **`postalCode` / `city`** are parsed but never rendered — either surface them or stop
  extracting them.

Removing all of the above cuts roughly **350 lines** and two npm dependencies.

---

## 15. Security

### Current posture

**Good:** all processing is client-side, so packing slips containing customer PII never
leave the device. `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`
are set in `public/_headers`.

### Issues

**1. `pdfjs-dist` version is vulnerable — directly relevant.**

`npm audit` on the current lockfile:

| Package | Severity | Advisory |
|---|---|---|
| **pdfjs-dist** `>=5.6.83 <6.2.108` | **high** | **Arbitrary JS execution on opening a malicious PDF** (GHSA-hq66-cqwq-w95j) |
| nanoid `<3.3.18` | high | infinite loop when size is zero (GHSA-2v37-7h3g-55p8) |
| dompurify `<=3.4.12` | moderate | XSS via detached subtree (GHSA-55q2-fjhq-7xh7) |
| postcss `<=8.5.22` | moderate | arbitrary `.map` read (GHSA-fxqj-rqcc-2cmp) |

`package.json` pins `^6.1.200`, which resolves **below** the `6.2.108` fix line. The
pdfjs advisory matters here because **opening untrusted PDFs is the app's entire
function**. `npm audit fix` clears all four within the existing semver ranges.

**2. No Content-Security-Policy header.** Worth adding, though note the CDN fallback in
§11.2 needs allow-listing or removing first.

**3. The CDN worker fallback** silently loads executable code from a third-party origin
and defeats the offline/privacy guarantee. Prefer failing loudly.

**4. No file-size limit.** A very large PDF will freeze the tab. Add a guard
(e.g. 25 MB) and a page-count cap.

---

## 16. Rebuild recommendations

If you are building a new web app from this, here is what to keep, fix, and add.

### Keep — these decisions are sound

- **Client-side-only parsing.** PII never leaves the device. This is the app's best property.
- **SVG QR codes.** Scale to printer DPI without pixelation.
- **CSS-based printing** with `break-inside: avoid`. No jsPDF/html2canvas needed.
- **The three iOS Safari workarounds** (§11) — hard-won, correct, and well commented.
- **Magic-byte validation** before handing bytes to pdfjs.
- **Structured error codes** (`EMPTY_FILE` / `NOT_PDF` / `INVALID_PDF`) driving distinct UI.

### Fix before shipping

| Priority | Item | Ref |
|---|---|---|
| P0 | Normalise `uploadError` to one shape | §13.1 |
| P0 | Upgrade `pdfjs-dist` past 6.2.108 | §15 |
| P0 | Never fabricate order numbers — flag unparsed labels visibly | §13.6 |
| P1 | Replace the JS hover listeners with CSS | §13.2 |
| P1 | Validate **per label**, not per document | §6.4 |
| P1 | Add `Escape` + focus trap + backdrop close to both modals | §13.7 |
| P2 | Move the polyfill to a first-imported module | §13.3 |
| P2 | `crypto.randomUUID()` for ids | §13.8 |
| P2 | Delete all dead code and the two unused deps | §14 |

### Add — highest value first

1. **Persistence.** `localStorage` sync on `labels`. ~5 lines, eliminates the single
   worst failure mode (accidental refresh loses a whole batch).
2. **TypeScript, or Zod at the parser boundary.** The `Label` shape is passed through six
   components untyped, and the two creation paths already disagree (§5).
3. **Parser unit tests.** Extract `parseAmazonPackingSlip` (it is already pure — it takes
   `{lines, rawText}` and returns an object) and test it against fixture text dumps.
   This is the highest-risk code in the app and currently has zero tests.
4. **A "needs review" state** on labels, surfaced in the UI and blocking print.
5. **`@page` rules** for real margin/size control, plus a paper-size selector
   (A4 vs Letter) and a label-per-sheet preset.
6. **Per-label print selection** — checkboxes to reprint a subset after a paper jam.
7. **Bulk edit** — set country or vendor across all labels at once.
8. **Progress indication** for multi-page PDFs. Parsing is a blocking `for` loop over
   pages with no feedback; a 100-page PDF looks frozen.
9. **File-size and page-count guards** with a clear message.
10. **Decide on Tailwind** — commit to it and convert the inline styles, or drop it (§9).

### Suggested architecture for the rebuild

```
src/
├── main.tsx
├── polyfills.ts              # Math.sumPrecise — imported FIRST
├── app/
│   ├── App.tsx               # routing between screens only
│   └── store.ts              # labels state + localStorage sync
├── features/
│   ├── upload/               # UploadScreen, DropZone, ErrorAlert
│   ├── labels/               # LabelSheet, LabelCard, EditLabelModal, ProductModal
│   └── print/                # print styles, @page rules, paper presets
├── lib/
│   ├── pdf/
│   │   ├── worker.ts         # iOS-safe PDFWorker singleton
│   │   ├── extractText.ts    # PDF → {pageNumber, rawText, lines}[]
│   │   └── parseSlip.ts      # pure, unit-tested field extraction
│   └── types.ts              # Label, ProductDetails, ParseError
└── styles/
    └── index.css
```

The key move is **isolating `parseSlip.ts` as a pure, tested function**. Everything else
is presentation; that file is where the actual risk lives.

---

## 17. Appendix: full regex cheatsheet

Copy-paste reference for the parser rules, verbatim from `src/utils/pdfParser.js`:

```js
// Order number — primary
/(?:Num[eé]ro de la commande|Order ID|Commande n[oº])[\s:]*([0-9]{3}-[0-9]{7}-[0-9]{7})/i

// Order number — bare fallback
/([0-9]{3}-[0-9]{7}-[0-9]{7})/

// Phone
/(?:N°\s*portable|Téléphone|Phone|Tél)[\s:]*([0-9+\s.()-]{8,20})/i

// Shipping-address anchor (tested per line)
/Adresse d['’]expédition/i
/Ship To/i
/Livrer à/i

// Lines removed from the address block
/Numéro de la commande|Date de commande|Merci pour votre achat|Quantité|Détails/i

// Fallback anchor: postal code + city
/^[0-9]{4,5}\s+[A-Za-z\s-]+/

// Country whitelist
/^(France|Espagne|Spain|Belgique|Deutschland|Italy|Italie|Portugal|United Kingdom)/i

// Postal code + city capture
/\b([0-9]{5})\s+(.+)/

// Product identifiers
/ASIN\s*:?\s*([A-Z0-9]{10})/i
/SKU\s*:?\s*([^\n\r]+)/i

// Product title anchor — title is the NEXT line, truncated to 120 chars
/Quantité|Détails de l['’]article|Prix/i
```

### Line-reconstruction constants

| Constant | Value | Meaning |
|---|---|---|
| Y snap grid | `4` pt | `Math.round(item.transform[5] / 4) * 4` |
| Run join | `' '` | single space between glyph runs on a line |
| Y sort | descending | top of page → bottom |
| X sort | ascending | left → right |
| Address window | `6` lines | `lines.slice(anchor+1, anchor+7)` |
| Title truncation | `120` chars | `.substring(0, 120)` |
| Mobile breakpoint | `640` px | `window.innerWidth < 640` |
| QR size (card) | `70`, level `M` | `includeMargin`, `clamp(56px,16vw,76px)` |
| QR size (modal) | `72`, level `H` | — |

---

*End of specification.*
