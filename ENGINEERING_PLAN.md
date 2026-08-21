# Label Generator v2 — Engineering Plan

**Context:** production rebuild of the Amazon PDF → QR shipping label generator.
Internal tool, own staff only. Team of 2–5 developers.

**Companion document:** [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) — full analysis of the v1 codebase.

---

## 0. The framing: what "corporate-grade" means *here*

Most professional-web-app advice is written for products with thousands of external
users. You have an internal tool used by warehouse staff. Copying that advice wholesale
would cost months and protect you from risks you do not have.

**Define the actual failure mode first.** For this app it is:

> A wrong address, or a fabricated order number, gets printed on a physical parcel —
> and that parcel ships.

That single sentence should drive every decision. The consequences are real money
(reshipping, lost goods), customer trust, and — because you are handling French
customers' names, addresses, and phone numbers — a **GDPR incident** if that data leaks.

Ranked by how much they reduce *that* risk:

| Rank | Investment | Risk reduced |
|---|---|---|
| 1 | Parser correctness: typed contracts, confidence scoring, golden-file tests | ██████████ |
| 2 | Never fabricate data — flag low-confidence labels, block printing | █████████ |
| 3 | Persistence + audit trail (what shipped, when, by whom) | ███████ |
| 4 | CI gates: typecheck, lint, test on every PR | ██████ |
| 5 | GDPR posture: data minimization, retention, access control | █████ |
| 6 | Accessibility, design system, component library | ███ |
| 7 | Kubernetes, microservices, service mesh, event sourcing | ▏ |

Row 7 is a joke, but only barely — it is where a lot of "enterprise rebuild" energy goes.
**Spend your effort at the top of this table.**

---

## 1. Decision: does it need a backend?

You delegated this one. **My recommendation: yes — but a deliberately thin one, and the
PDF bytes must never reach it.**

### The split

```
┌─────────────────── BROWSER ───────────────────┐   ┌────────── SERVER ──────────┐
│                                               │   │                            │
│  PDF file  ──►  parse  ──►  extracted fields  │──►│  label metadata + audit    │
│  (never leaves the device)                    │   │  (no PDF, no raw file)     │
│                                               │   │                            │
└───────────────────────────────────────────────┘   └────────────────────────────┘
```

Parsing stays 100% client-side. The server stores only the **extracted metadata** and an
**audit log** — never the uploaded PDF.

### Why a backend at all

| Need | Why it matters operationally |
|---|---|
| **Persistence** | Today a refresh destroys an entire batch. This is v1's single worst bug. |
| **Audit trail** | "Was a label printed for order 405-…? By whom? Was it reprinted?" In shipping operations this question gets asked during every dispute. Without it you are guessing. |
| **Multi-station** | Two pack stations working the same batch need one shared view of what is done. |
| **Shared config** | Label templates, carrier presets, paper sizes — set once, not per-browser. |

### Why the PDF must not be uploaded

- **Data minimization (GDPR Art. 5(1)(c)).** You are not permitted to store more personal
  data than the purpose requires. You need the *address to print a label*, not the
  original invoice document. Not uploading is both cheaper and legally cleaner.
- **Breach surface.** A bucket of customer invoices is a serious incident waiting to
  happen. A metadata table with a 90-day retention policy is a much smaller target.
- **Cost and speed.** No upload bandwidth, no storage bill, no virus scanning.
- **It preserves v1's best property.** The current app's privacy model is genuinely good.
  Keep it.

### Phase it — do not build this on day one

| Phase | What | Effort | Unblocks |
|---|---|---|---|
| **1** | **Local-first only.** IndexedDB via Dexie. No server. | ~1 day | Kills the refresh bug immediately |
| **2** | Thin API + Postgres. Sync batches, audit log, auth. | ~1–2 weeks | Multi-station, disputes, reporting |
| **3** | Only if actually needed: reporting dashboard, carrier APIs | — | — |

**Ship Phase 1 in week one.** It removes the worst daily pain for a day of work and
requires zero infrastructure. Move to Phase 2 when a second pack station genuinely needs
shared state — not before.

---

## 2. Stack

### Keep Vite + React. Do not move to Next.js.

You will be told to use Next.js. For *this* app it is the wrong call:

- **No SEO requirement.** Internal tool behind auth. SSR buys you nothing.
- **Client-side PDF parsing fights SSR.** `pdfjs-dist`, Web Workers, and `window` access
  all need `'use client'` and dynamic imports everywhere. You would spend real time
  fighting the framework for zero benefit.
- **Vite is faster to develop against**, and your team already knows this setup.

Next.js would be right if this became a public marketing-facing product. It is not.

### Recommended stack

| Concern | Choice | Why |
|---|---|---|
| **Language** | **TypeScript** (strict) | Non-negotiable. The `Label` shape flows through six components untyped today, and the two creation paths already disagree (see spec §5). |
| Framework | React 19 + Vite 8 | Keep. Team knows it. |
| **Validation** | **Zod** | Parse, don't validate. Every boundary: PDF output, API responses, form input, localStorage reads. |
| State (client) | **Zustand** | Small, typed, no boilerplate. Redux is overkill at this size. |
| State (server) | **TanStack Query** (Phase 2) | Caching, retries, optimistic updates — do not hand-roll this. |
| **Styling** | **Tailwind v4** — commit fully | Already installed and currently paying for it while using inline styles (spec §9). Pick one; Tailwind is the right pick. |
| **Components** | **shadcn/ui** | Copy-in, not a dependency. Its Dialog is built on Radix — **fixes every modal a11y bug from spec §13.7 for free** (Escape, focus trap, ARIA, restore focus). |
| Icons | lucide-react | Keep. Already a shadcn/ui peer. |
| **Unit tests** | **Vitest** | Same Vite config, near-zero setup. |
| **E2E tests** | **Playwright** | The only realistic way to test the print flow and PDF upload. |
| PDF | pdfjs-dist **≥ 6.2.108** | Current pin is below a known RCE fix. See §6. |
| QR | qrcode.react (SVG) | Keep. SVG scales to printer DPI — correct choice. |
| Local storage | **Dexie** (IndexedDB) | Phase 1 persistence. `localStorage` will not hold large batches. |
| **Backend** (Phase 2) | **Hono + Postgres + Drizzle** | Boring, portable, fully typed end-to-end. |
| Auth (Phase 2) | Your existing SSO (Google/Microsoft) via OIDC | Internal tool — do not build a password system. |
| Errors | **Sentry** | You cannot debug a warehouse PC over the phone. |
| Hosting | Netlify (frontend) + Fly.io/Railway (API) | Keep Netlify; it already works. |

**Accelerator option:** if you have no existing identity provider, **Supabase**
(Postgres + Auth + Row Level Security) collapses Phase 2 to a few days. Acceptable
lock-in for an internal tool. If you *do* have Google Workspace or Microsoft 365 SSO,
use it and keep Postgres plain.

---

## 3. Architecture

### The core principle: the parser is the product

Everything else is presentation. `parseAmazonPackingSlip` is where wrong addresses come
from. Treat it as a **separately versioned, purely functional, exhaustively tested
module** with no React, no DOM, and no I/O.

```
src/
├── main.tsx
├── polyfills.ts              # Math.sumPrecise — imported FIRST (fixes spec §13.3)
│
├── app/
│   ├── App.tsx               # screen routing only, no business logic
│   ├── providers.tsx         # QueryClient, error boundary, toaster
│   └── store.ts              # Zustand: labels, selection, UI state
│
├── features/
│   ├── upload/               # UploadScreen, DropZone, ErrorAlert
│   ├── labels/               # LabelSheet, LabelCard, EditLabelDialog, DetailsDialog
│   ├── review/               # ⭐ NEW: low-confidence label triage
│   └── print/                # print styles, @page rules, paper presets
│
├── lib/
│   ├── pdf/
│   │   ├── worker.ts         # iOS-safe PDFWorker singleton
│   │   ├── extractText.ts    # PDF → PageText[]        (pure after I/O)
│   │   ├── parseSlip.ts      # ⭐ PageText → ParsedLabel  (100% PURE, 100% TESTED)
│   │   ├── rules/            # one file per field: orderNumber.ts, address.ts, …
│   │   └── __fixtures__/     # ⭐ anonymized real text dumps
│   ├── schema.ts             # Zod schemas — the single source of truth for types
│   └── db.ts                 # Dexie (Phase 1) / API client (Phase 2)
│
└── styles/index.css
```

### Types flow from Zod, not the other way round

```ts
// lib/schema.ts — ONE definition, used at every boundary
export const ProductDetails = z.object({
  title:    z.string(),
  sku:      z.string(),
  asin:     z.string().regex(/^[A-Z0-9]{10}$/).nullable(),
  quantity: z.number().int().positive(),
  vendor:   z.string(),
});

export const Label = z.object({
  id:            z.string().uuid(),
  pageNumber:    z.number().int().positive(),
  recipientName: z.string().min(1),
  addressLines:  z.array(z.string()).min(1),
  postalCode:    z.string().nullable(),
  city:          z.string().nullable(),
  country:       z.string(),
  phone:         z.string().nullable(),
  orderNumber:   z.string().regex(/^\d{3}-\d{7}-\d{7}$/),
  productDetails: ProductDetails,

  // ── provenance & trust ──────────────────────────────
  confidence:    z.record(z.enum(['high', 'low', 'missing'])),
  needsReview:   z.boolean(),
  parserVersion: z.string(),          // e.g. "2.1.0"
  source:        z.enum(['parsed', 'manual']),
});

export type Label = z.infer<typeof Label>;
```

`parserVersion` matters more than it looks: when you discover a parsing bug six months
from now, it tells you **exactly which historical labels are suspect**.

### The single most important change: stop fabricating data

v1 invents a random order number when it cannot find one (spec §6.3). Replace every
silent fallback with an explicit confidence signal.

```ts
// ❌ v1 — silently invents a plausible-looking order number
let orderNumber = `405-${rand(7)}-${rand(7)}`;

// ✅ v2 — absence is represented, never invented
type Extracted<T> =
  | { value: T;    confidence: 'high' | 'low' }
  | { value: null; confidence: 'missing' };

function extractOrderNumber(text: string): Extracted<string> {
  const labelled = text.match(ORDER_LABELLED);
  if (labelled) return { value: labelled[1], confidence: 'high' };

  const bare = text.match(ORDER_BARE);
  if (bare) return { value: bare[1], confidence: 'low' };   // found, but unanchored

  return { value: null, confidence: 'missing' };            // ← never a fake
}
```

Then, in the UI:

- `confidence: 'low'` → amber badge on the card, still printable
- `confidence: 'missing'` → red card, **excluded from print** until a human fixes it
- A **Review queue** (`features/review/`) listing everything needing attention
- The Print button reports: *"38 ready · 2 need review"* and refuses to print the 2

This one change eliminates the highest-severity defect in v1.

### Validate per label, not per document

v1 accepts the whole PDF if *one* page parses (spec §6.4) — so in a 50-page batch,
pages 2–50 can ship fabricated numbers. In v2 every label carries its own verdict.

---

## 4. Making the parser trustworthy

This section is the actual engineering work. Everything else is standard web app hygiene.

### 4.1 Build a golden-file corpus — do this first

```
lib/pdf/__fixtures__/
├── fr-standard-2024.txt          # typical French packing slip
├── fr-long-address.txt           # 6-line address, company name
├── fr-multi-item.txt             # several products on one slip
├── fr-accented-name.txt          # Ç, É, ü, apostrophes
├── es-spain.txt                  # Spanish destination
├── de-germany.txt                # unlisted country (v1 mislabels this "France"!)
├── edge-no-phone.txt
├── edge-4digit-postcode.txt
└── malformed-scanned.txt         # image-only PDF → zero text items
```

**How to build it:** run each real PDF through `extractText.ts`, save the text output,
then **replace every real name, address, and phone with fake data** by hand. You are
committing text, not PDFs — small, diffable, and free of PII.

```ts
// parseSlip.test.ts
import fixture from './__fixtures__/de-germany.txt?raw';

test('does not default an unlisted country to France', () => {
  const label = parseSlip(toPageText(fixture));
  expect(label.country.value).toBe('Deutschland');
  expect(label.country.confidence).not.toBe('missing');
});
```

**Why this is the highest-leverage practice available to you:** when Amazon changes their
packing-slip layout, a test fails in CI. Today, a customer gets a wrong parcel and you
find out from a complaint.

### 4.2 One rule per file

Split the 120-line regex soup into `lib/pdf/rules/`, one file and one test per field.
Each rule is a pure function with a declared confidence policy. Adding support for a new
marketplace or locale becomes an additive change, not a risky edit to a monolith.

### 4.3 Property-based testing for the line reconstructor

The Y-grid snapping in `extractText.ts` (spec §6.1) is subtle and easy to regress. Use
`fast-check` to assert invariants — e.g. *items more than 8pt apart in Y never merge into
one line* — across generated inputs, not just your fixtures.

### 4.4 Version the parser

Export `PARSER_VERSION` and stamp it on every label. Bump it whenever a rule changes.
Six months from now this is how you answer "which batches were affected?"

---

## 5. Quality gates

For 2–5 developers, this is the right amount of process — no more.

### CI on every pull request

```yaml
# .github/workflows/ci.yml
name: CI
on: [pull_request, push]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck      # tsc --noEmit
      - run: npm run lint           # oxlint
      - run: npm run test           # vitest run --coverage
      - run: npm run build
      - run: npx playwright test    # E2E: upload → review → print
```

### Branch protection on `main`

- CI must pass
- **1 approving review** (enough at your size — 2 is friction, not safety)
- No direct pushes
- Squash merge, linear history

### TypeScript config — strict from day one

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,   // catches lines[i] being undefined — a real v1 risk
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true
  }
}
```

`noUncheckedIndexedAccess` is worth the friction here specifically: v1's parser indexes
into `lines[]` constantly without bounds checks.

### Coverage policy — targeted, not global

A blanket "80% coverage" rule produces tests written to game the number. Instead:

| Path | Requirement |
|---|---|
| `lib/pdf/**` | **95%+, enforced in CI** |
| `lib/schema.ts` | 100% (trivial — schemas are declarative) |
| `features/**` | No threshold. E2E covers the flows that matter. |

### Pre-commit hooks

Husky + lint-staged: format and lint staged files only. Keep it under two seconds or the
team will start using `--no-verify`.

### Definition of done

A PR is complete when: types pass strict, new parser logic has a fixture test, the UI
change works with keyboard only, and the PR description says how it was verified.

---

## 6. Security & GDPR

You are processing French customers' names, addresses, and phone numbers. GDPR applies —
including to internal tools. This is the part most internal projects skip and later regret.

### Immediate

| Action | Detail |
|---|---|
| **Upgrade `pdfjs-dist`** | Current `^6.1.200` resolves **below** the fix for GHSA-hq66-cqwq-w95j — **arbitrary JS execution when opening a malicious PDF**. Pin `>=6.2.108`. This is your literal attack surface: the app's whole job is opening PDFs. |
| Run `npm audit fix` | Also clears the nanoid, dompurify, and postcss advisories. |
| `npm audit` in CI | Fail the build on high/critical. |
| Enable Dependabot | Weekly, grouped, auto-merge patch updates that pass CI. |

### Remove the CDN worker fallback

v1 silently falls back to loading `pdf.worker.min.mjs` from `cdnjs.cloudflare.com`
(spec §11.2). That defeats the offline guarantee, adds a third-party code-execution
dependency, and breaks the privacy story. **Fail loudly instead** — a clear error beats a
silent downgrade.

### Add a Content-Security-Policy

Removing the CDN fallback makes a tight policy possible:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src  'self' https://fonts.gstatic.com;
  img-src   'self' data: blob:;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  object-src 'none';
```

`worker-src blob:` is required by the inline PDF worker. Consider self-hosting the two
Google Fonts to drop those origins entirely and gain a small load-time win.

### GDPR posture (Phase 2, when data hits a server)

| Principle | Implementation |
|---|---|
| **Data minimization** | Never store the PDF. Store only the fields needed to print. |
| **Retention** | Auto-delete label rows after 90 days (a cron job, not a policy document nobody runs). Keep the audit log longer with the address fields nulled out. |
| **Access control** | SSO + roles. Warehouse staff read/print; admins export. |
| **Auditability** | Append-only log: who viewed, printed, edited, deleted — with timestamps. |
| **Encryption** | TLS in transit; Postgres encryption at rest (managed hosts do this by default). |
| **Right to erasure** | A supported operation, not a manual `DELETE` someone runs by hand. |
| **Record of processing** | One page: what you collect, why, how long, who can see it. Write it once. |

**Also:** because parsing is client-side, warehouse browsers hold PII in memory and
IndexedDB. Add an explicit **"Clear local data"** control and auto-clear on sign-out.

---

## 7. Operations

Keep this proportional — you have 2–5 developers, not an SRE team.

### Environments

| Env | Purpose | Data |
|---|---|---|
| Local | development | fixtures only, never real customer PDFs |
| Preview | one per PR (Netlify does this automatically) | fixtures |
| Production | warehouse | real |

**Two environments plus previews is enough.** A separate staging tier for an internal
tool of this size is overhead without benefit.

### Monitoring — three things only

1. **Sentry** for frontend errors — with a scrubbing rule that strips addresses and phone
   numbers from error payloads before they leave the browser. Non-negotiable given the PII.
2. **A parse-failure metric.** Count labels landing in the review queue, per day. A sudden
   spike means Amazon changed their layout — you want to know that morning, not from a
   customer complaint next week.
3. **Uptime check** on the API (Phase 2). A free pinger is fine.

Skip APM, distributed tracing, and log aggregation until something actually hurts.

### Release process

Trunk-based with short-lived branches. Merging to `main` deploys to production
automatically. At your size, release trains and versioned deploys add ceremony without
reducing risk — **but keep Netlify's instant rollback one click away** and make sure
everyone on the team knows where that button is.

### Documentation that earns its keep

| Document | Why |
|---|---|
| `README.md` | Setup, scripts, architecture in 30 lines. **Replace the stock Vite template** currently sitting there. |
| `PROJECT_SPEC.md` | Already written — the v1 analysis. |
| `docs/adr/` | Architecture Decision Records: one short page per significant choice (why client-side parsing, why no Next.js, why metadata-only). Six months from now this stops the team relitigating settled decisions. |
| `docs/runbook.md` | "Amazon changed their layout — what do I do?" Written *before* it happens. |

Skip Storybook, a component catalogue, and generated API docs until you have enough
surface area to justify them.

---

## 8. Roadmap

| Phase | Scope | Effort |
|---|---|---|
| **0 — Stabilize** | Fix the P0 bugs in v1 while v2 is built: `uploadError` shape (spec §13.1), pdfjs upgrade, flag fabricated order numbers. Ship to the warehouse now. | 1–2 days |
| **1 — Foundation** | TypeScript strict, Zod schemas, Vitest + Playwright, CI pipeline, branch protection. Port components as-is. | 1 week |
| **2 — Parser rebuild** | Extract `parseSlip.ts` as pure. Build the fixture corpus. Confidence scoring. Delete all silent fallbacks. | 1–2 weeks |
| **3 — Trust UI** | Review queue, confidence badges, print gating, per-label print selection. | 1 week |
| **4 — Persistence** | Dexie/IndexedDB local-first. Autosave, restore on reload. | 2–3 days |
| **5 — Print quality** | `@page` rules, A4/Letter presets, margin control, print preview. | 3–4 days |
| **6 — Backend** *(only when a 2nd station needs it)* | Hono + Postgres + Drizzle, SSO, audit log, retention job. | 1–2 weeks |

**Phase 0 matters.** Do not let the team disappear into a rebuild while the warehouse
keeps using a version that invents order numbers. Fix that in v1 this week.

Total to a genuinely production-grade internal tool: **roughly 5–7 weeks** for one
developer, less with two working in parallel after Phase 1.

---

## 9. What *not* to do at your size

Explicit anti-recommendations. Each of these is something a team of five will be told to
adopt and should decline.

| Avoid | Why |
|---|---|
| **Microservices** | One frontend and one small API. A service boundary here is pure cost. |
| **Kubernetes** | Netlify + a managed container host. You do not need a cluster to run one API. |
| **GraphQL** | Perhaps a dozen endpoints. REST with typed clients is less machinery. |
| **Redux Toolkit / Saga** | Zustand covers this app's state in a fraction of the code. |
| **Custom design system** | shadcn/ui gives you accessible primitives immediately. Build a design system when you have several products, not one. |
| **Blanket coverage thresholds** | Produces tests that game a number. Enforce coverage where risk lives (`lib/pdf/**`), nowhere else. |
| **Monorepo (Nx/Turborepo)** | One app. Add it if a second app appears. |
| **Server-side PDF parsing** | Throws away the privacy advantage, adds cost, upload latency, and PII storage duties. |
| **Micro-frontends** | For an internal tool with one team, this is unambiguously wrong. |
| **A separate staging environment** | PR previews already give you this, per-branch. |
| **Scrum ceremony for 3 devs** | A shared board and a short daily sync. Nothing more. |

---

## 10. Week one, concretely

If you do only this, you will already be ahead of most internal tooling:

1. **Fix `uploadError`** — one shape. Users currently get an empty error box (spec §13.1).
2. **`npm audit fix`** and pin `pdfjs-dist >= 6.2.108`. You open untrusted PDFs for a living.
3. **Stop fabricating order numbers.** Even in v1: mark them, badge them red, exclude them
   from print. This is the change that prevents a wrong parcel shipping.
4. **Add IndexedDB autosave.** One day of work; removes the worst daily frustration.
5. **Start the fixture corpus.** Every real PDF that crosses your desk this week becomes an
   anonymized text fixture. This asset compounds and cannot be built retroactively.
6. **Turn on CI and branch protection.** Even with only typecheck and build at first.
7. **Replace the stock Vite README** with real setup instructions.

Items 1–3 can ship to the warehouse this week against the *current* codebase. They do not
need the rebuild.

---

## Appendix: proposed `package.json`

```jsonc
{
  "scripts": {
    "dev":       "vite",
    "build":     "tsc --noEmit && vite build",
    "preview":   "vite preview",
    "typecheck": "tsc --noEmit",
    "lint":      "oxlint",
    "test":      "vitest run",
    "test:watch":"vitest",
    "test:e2e":  "playwright test",
    "verify":    "npm run typecheck && npm run lint && npm run test && npm run build"
  },
  "dependencies": {
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "pdfjs-dist": "^6.2.108",        // ← security fix
    "qrcode.react": "^4.2.0",
    "lucide-react": "^1.25.0",
    "zod": "^3.24.0",
    "zustand": "^5.0.0",
    "dexie": "^4.0.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
    // removed: html2canvas, jspdf  (never imported in v1)
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^8.1.1",
    "@vitejs/plugin-react": "^6.0.3",
    "@tailwindcss/vite": "^4.3.3",
    "tailwindcss": "^4.3.3",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "@playwright/test": "^1.49.0",
    "fast-check": "^3.23.0",
    "oxlint": "^1.71.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3"
  }
}
```

---

*Plan prepared 2026-08-21. Revisit after Phase 2 — the backend decision in particular
should be re-evaluated against real usage, not assumptions.*
