import type { PageText } from './lines';
import { matchCountry } from './countries';
import { newId } from '../id';
import {
  ORDER_NUMBER_RE,
  type Confidence,
  type Label,
  type ProductDetails,
  type ReviewReason,
  type StringField,
} from '../types';

/**
 * Parser version.
 *
 * Stamped onto every label. When a parsing bug surfaces later, this tells
 * you exactly which historical labels are suspect. Bump on any rule change.
 */
export const PARSER_VERSION = '2.0.0';

/* ═══════════════════════════════════════════════════════════════════
   Patterns
   ═══════════════════════════════════════════════════════════════════ */

/** Order number preceded by an explicit label → high confidence. */
const ORDER_ANCHORED =
  /(?:num[ée]ro\s+de\s+(?:la\s+)?commande|order\s*(?:id|number)|commande\s*n[°ºo]?|n[°ºo]\s*de\s*commande)\s*[:.\-]?\s*(\d{3}-\d{7}-\d{7})/i;

/** Bare order-number shape anywhere on the page → low confidence. */
const ORDER_BARE = /\b(\d{3}-\d{7}-\d{7})\b/;

/** Phone, labelled. */
const PHONE_ANCHORED =
  /(?:n[°ºo]\s*(?:de\s*)?portable|t[ée]l[ée]phone|phone|tel|mobile|gsm)\s*[:.\-]?\s*((?:\+\d{1,3}[\s.]?)?[\d][\d\s.()\-]{6,18}\d)/i;

/** The subset of phone labels that mean a mobile/portable line. */
const PHONE_MOBILE_LABEL = /n[°ºo]\s*(?:de\s*)?portable|mobile|gsm/i;

/** Ship-to block anchors, in priority order. */
const SHIP_TO_ANCHOR =
  /(?:adresse\s+de\s+livraison|adresse\s+d['’]exp[ée]dition|shipping\s+address|ship\s*to|deliver\s+to|livrer\s+[àa])\s*:?\s*$/i;

/** Looser anchor: the phrase appears but other text follows on the line. */
const SHIP_TO_INLINE =
  /(?:adresse\s+de\s+livraison|adresse\s+d['’]exp[ée]dition|shipping\s+address|ship\s*to|deliver\s+to|livrer\s+[àa])\s*:?\s*(.*)$/i;

/** Lines that are invoice furniture, never part of an address. */
const NOT_ADDRESS =
  /num[ée]ro\s+de\s+(?:la\s+)?commande|date\s+de\s+(?:la\s+)?commande|order\s*(?:id|date)|merci\s+pour|thank\s+you|quantit[ée]|d[ée]tails?\s+de|unit\s+price|prix\s+unitaire|sous-total|subtotal|total|tva|vat|facture|invoice|adresse\s+de\s+facturation|billing\s+address|page\s+\d+/i;

/**
 * Postal code + city, covering 4- and 5-digit European formats and the UK.
 *
 * Order matters: most specific first. The generic 4-digit pattern would
 * otherwise swallow the Dutch "1015 CW Amsterdam" as code "1015" and city
 * "CW Amsterdam".
 */
const POSTAL_CITY = [
  /^(\d{4}\s?[A-Z]{2})\s+(.{2,})$/i, // NL — 1015 CW Amsterdam
  /^([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\s+(.{2,})$/i, // UK — SW1A 1AA London
  /^(\d{5})\s+(.{2,})$/, // FR, ES, DE, IT
  /^(\d{4})\s+(.{2,})$/, // BE, AT, DK
];

const ASIN = /\bASIN\s*[:.\-]?\s*([A-Z0-9]{10})\b/i;
const SKU = /\bSKU\s*[:.\-]?\s*([A-Za-z0-9][A-Za-z0-9._\-/]{1,40})/i;
const QTY_ANCHORED = /(?:quantit[ée]|qty|qte)\s*[:.\-]?\s*(\d{1,4})\b/i;
const ITEM_HEADER = /quantit[ée]|d[ée]tails?\s+de\s+l['’]article|item\s+details|description|prix/i;

/* ═══════════════════════════════════════════════════════════════════
   Field helpers
   ═══════════════════════════════════════════════════════════════════ */

const found = (value: string, confidence: Confidence): StringField => ({ value, confidence });
const missing = (): StringField => ({ value: null, confidence: 'missing' });

/* ═══════════════════════════════════════════════════════════════════
   Individual rules — each pure, each independently testable
   ═══════════════════════════════════════════════════════════════════ */

export function extractOrderNumber(raw: string): StringField {
  const anchored = raw.match(ORDER_ANCHORED);
  if (anchored?.[1]) return found(anchored[1], 'high');

  const bare = raw.match(ORDER_BARE);
  if (bare?.[1]) return found(bare[1], 'low');

  // Never fabricated. v1 generated a random number here.
  return missing();
}

export function extractPhone(raw: string): StringField {
  const m = raw.match(PHONE_ANCHORED);
  if (!m?.[1]) return missing();

  const cleaned = m[1].replace(/[\s.]+/g, ' ').trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return missing();

  return found(cleaned, 'high');
}

/** Locate the ship-to block and return its lines. */
function findAddressBlock(lines: string[]): { block: string[]; confidence: Confidence } {
  // 1. A line that is purely the anchor — address follows it.
  const anchorIdx = lines.findIndex((l) => SHIP_TO_ANCHOR.test(l));
  if (anchorIdx !== -1) {
    const block = collectBlock(lines, anchorIdx + 1);
    if (block.length > 0) return { block, confidence: 'high' };
  }

  // 2. Anchor with content on the same line.
  const inlineIdx = lines.findIndex((l) => SHIP_TO_INLINE.test(l));
  if (inlineIdx !== -1) {
    const line = lines[inlineIdx];
    const tail = line?.match(SHIP_TO_INLINE)?.[1]?.trim() ?? '';
    const block = collectBlock(lines, inlineIdx + 1);
    const merged = tail ? [tail, ...block] : block;
    if (merged.length > 0) return { block: merged, confidence: 'high' };
  }

  // 3. Fallback: find a postal-code line and read the block around it.
  //    Lower confidence — there is no anchor confirming this is the
  //    shipping address rather than the billing address.
  const postalIdx = lines.findIndex((l) => matchPostalCity(l) !== null);
  if (postalIdx > 0) {
    const start = Math.max(0, postalIdx - 3);
    const block = lines
      .slice(start, postalIdx + 3)
      .filter((l) => !NOT_ADDRESS.test(l))
      .filter((l) => l.trim().length > 0);
    if (block.length > 0) return { block, confidence: 'low' };
  }

  return { block: [], confidence: 'missing' };
}

/**
 * Collect consecutive address lines starting at `from`, stopping at the
 * first invoice-furniture line or blank run.
 *
 * v1 took a fixed 6-line window, which truncated long addresses and swept
 * in unrelated text after short ones.
 */
function collectBlock(lines: string[], from: number): string[] {
  const out: string[] = [];
  for (let i = from; i < lines.length && out.length < 8; i++) {
    const line = lines[i];
    if (line === undefined) break;
    const t = line.trim();
    if (t.length === 0) {
      if (out.length > 0) break;
      continue;
    }
    if (NOT_ADDRESS.test(t)) break;
    out.push(t);
  }
  return out;
}

function matchPostalCity(line: string): { postalCode: string; city: string } | null {
  for (const re of POSTAL_CITY) {
    const m = line.trim().match(re);
    if (m?.[1] && m[2]) {
      return { postalCode: m[1].toUpperCase(), city: m[2].trim() };
    }
  }
  return null;
}

export function extractProduct(raw: string, lines: string[]): ProductDetails {
  const asin = raw.match(ASIN)?.[1]?.toUpperCase() ?? null;
  const sku = raw.match(SKU)?.[1]?.trim() ?? null;

  const qtyRaw = raw.match(QTY_ANCHORED)?.[1];
  const parsedQty = qtyRaw ? Number.parseInt(qtyRaw, 10) : Number.NaN;
  // Never assume 1 — v1 hardcoded it.
  const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : null;

  let title: string | null = null;
  const headerIdx = lines.findIndex((l) => ITEM_HEADER.test(l));
  if (headerIdx !== -1) {
    for (let i = headerIdx + 1; i < Math.min(lines.length, headerIdx + 4); i++) {
      const candidate = lines[i]?.trim();
      if (candidate && candidate.length > 3 && !NOT_ADDRESS.test(candidate)) {
        title = candidate.slice(0, 140);
        break;
      }
    }
  }

  return { title, sku, asin, quantity };
}

/* ═══════════════════════════════════════════════════════════════════
   Page → Label
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Parse one packing-slip page into a Label.
 *
 * Pure: no I/O, no DOM, no React. This is the highest-risk code in the
 * application and is covered by the fixture tests in parseSlip.test.ts.
 */
export function parseSlip(page: PageText): Label {
  const lines = page.lines.map((l) => l.trim()).filter((l) => l.length > 0);
  const raw = lines.join('\n');

  const orderNumber = extractOrderNumber(raw);
  const phone = extractPhone(raw);
  const phoneIsMobile = phone.value !== null && PHONE_MOBILE_LABEL.test(raw);
  const product = extractProduct(raw, lines);

  const { block, confidence: addrConfidence } = findAddressBlock(lines);

  // Split the block: first line is the recipient, the rest is the address.
  let recipientName: StringField = missing();
  let addressLines: string[] = [];

  if (block.length > 0) {
    const first = block[0];
    if (first) {
      const name = first.replace(/^[-•*\s]+/, '').trim();
      if (name.length > 0) recipientName = found(name, addrConfidence);
    }
    addressLines = block.slice(1);
  }

  // Pull the country out of the address lines so it is never duplicated.
  let country: StringField = missing();
  const remaining: string[] = [];
  for (const line of addressLines) {
    const hit = matchCountry(line);
    if (hit && country.value === null) {
      country = found(hit, addrConfidence === 'missing' ? 'low' : addrConfidence);
    } else {
      remaining.push(line);
    }
  }

  // Postal code and city.
  let postalCode: string | null = null;
  let city: string | null = null;
  let placeIndex = -1;
  for (let i = 0; i < remaining.length; i++) {
    const hit = matchPostalCity(remaining[i] ?? '');
    if (hit) {
      postalCode = hit.postalCode;
      city = hit.city;
      placeIndex = i;
      break;
    }
  }

  // That line is now represented by postalCode + city. Leaving it in `lines`
  // as well made the label print the place twice, e.g. a second
  // "92370 Chaville" directly under the first.
  const streetLines = placeIndex >= 0 ? remaining.filter((_, i) => i !== placeIndex) : remaining;

  /* ── Review reasons ─────────────────────────────────────────────── */
  const reviewReasons: ReviewReason[] = [];

  if (orderNumber.confidence === 'missing') reviewReasons.push('missing-order-number');
  else if (orderNumber.confidence === 'low') reviewReasons.push('unverified-order-number');

  if (recipientName.value === null) reviewReasons.push('missing-recipient');
  if (remaining.length === 0) reviewReasons.push('missing-address');
  if (country.value === null) reviewReasons.push('unknown-country');

  return {
    id: newId(),
    pageNumber: page.pageNumber,
    recipientName,
    address: { lines: streetLines, postalCode, city, country },
    phone,
    phoneIsMobile,
    orderNumber,
    product,
    reviewReasons,
    reviewed: false,
    // Blocked labels start deselected so a careless Print cannot include them.
    selected: reviewReasons.length === 0,
    source: 'parsed',
    parserVersion: PARSER_VERSION,
  };
}

/** Validate a hand-typed order number, used by the edit dialog. */
export function isValidOrderNumber(value: string): boolean {
  return ORDER_NUMBER_RE.test(value.trim());
}

/** Build an empty label for manual entry. */
export function createManualLabel(pageNumber: number): Label {
  return {
    id: newId(),
    pageNumber,
    recipientName: missing(),
    address: { lines: [], postalCode: null, city: null, country: missing() },
    phone: missing(),
    orderNumber: missing(),
    product: { title: null, sku: null, asin: null, quantity: null },
    reviewReasons: ['missing-order-number', 'missing-recipient', 'missing-address', 'unknown-country'],
    reviewed: false,
    selected: false,
    source: 'manual',
    parserVersion: PARSER_VERSION,
  };
}
