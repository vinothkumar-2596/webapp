import { z } from 'zod';

/* ═══════════════════════════════════════════════════════════════════
   Extraction confidence

   The single most important concept in this codebase.

   v1 invented data when parsing failed — a random order number that
   looked completely real. Those labels got printed onto parcels.

   Here, a field that could not be extracted is `null` with a
   confidence of 'missing'. It is never guessed, never defaulted to a
   plausible value, and the UI refuses to print it.
   ═══════════════════════════════════════════════════════════════════ */

export const Confidence = z.enum([
  /** Found via an explicitly labelled anchor (e.g. "Numéro de la commande: …"). */
  'high',
  /** Found by shape alone, without a label anchor. Plausible but unverified. */
  'low',
  /** Not found. The value is null. Never substituted. */
  'missing',
]);
export type Confidence = z.infer<typeof Confidence>;

/** A single extracted field, carrying its own provenance. */
export const Field = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    value: inner.nullable(),
    confidence: Confidence,
  });

export type Field<T> = { value: T | null; confidence: Confidence };

export const StringField = Field(z.string());
export type StringField = z.infer<typeof StringField>;

/* ═══════════════════════════════════════════════════════════════════
   Order number
   ═══════════════════════════════════════════════════════════════════ */

/** Amazon order ID: 3-7-7 digits, e.g. 402-7719834-2210xxx. */
export const ORDER_NUMBER_RE = /^\d{3}-\d{7}-\d{7}$/;

export const OrderNumber = z.string().regex(ORDER_NUMBER_RE, 'Not a valid Amazon order number');

/* ═══════════════════════════════════════════════════════════════════
   Address
   ═══════════════════════════════════════════════════════════════════ */

export const Address = z.object({
  /** Free-form street lines, in document order. Country is NOT included. */
  lines: z.array(z.string()),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  /**
   * Destination country.
   *
   * v1 silently defaulted anything unrecognised to "France" — which
   * printed the wrong country on real parcels. Here an unrecognised
   * country is null and the label is flagged for review.
   */
  country: StringField,
});
export type Address = z.infer<typeof Address>;

/* ═══════════════════════════════════════════════════════════════════
   Product
   ═══════════════════════════════════════════════════════════════════ */

export const ProductDetails = z.object({
  title: z.string().nullable(),
  sku: z.string().nullable(),
  asin: z.string().nullable(),
  /** Parsed from the slip when present. Never assumed to be 1. */
  quantity: z.number().int().positive().nullable(),
});
export type ProductDetails = z.infer<typeof ProductDetails>;

/* ═══════════════════════════════════════════════════════════════════
   Label
   ═══════════════════════════════════════════════════════════════════ */

/** Why a label needs human attention before it can be printed. */
export const ReviewReason = z.enum([
  'missing-order-number',
  'unverified-order-number',
  'missing-recipient',
  'missing-address',
  'unknown-country',
]);
export type ReviewReason = z.infer<typeof ReviewReason>;

export const REVIEW_REASON_TEXT: Record<ReviewReason, string> = {
  'missing-order-number': 'No order number could be read from this page',
  'unverified-order-number': 'Order number found without a label anchor — verify it',
  'missing-recipient': 'No recipient name could be read',
  'missing-address': 'No address lines could be read',
  'unknown-country': 'Destination country not recognised',
};

/** Reasons severe enough to block printing outright. */
export const BLOCKING_REASONS: ReadonlySet<ReviewReason> = new Set<ReviewReason>([
  'missing-order-number',
  'missing-recipient',
  'missing-address',
  'unknown-country',
]);

export const Label = z.object({
  id: z.string(),
  /** 1-based page in the source PDF this label came from. */
  pageNumber: z.number().int().positive(),

  recipientName: StringField,
  address: Address,
  phone: StringField,
  orderNumber: StringField,
  product: ProductDetails,

  /** Reasons this label needs attention. Empty means clean. */
  reviewReasons: z.array(ReviewReason),
  /** True once an operator has explicitly confirmed the data. */
  reviewed: z.boolean(),
  /** Whether the operator has selected this label for printing. */
  selected: z.boolean(),

  /** 'parsed' from a PDF, or 'manual' if hand-entered. */
  source: z.enum(['parsed', 'manual']),
  /**
   * Parser version that produced this label. When a parsing bug is
   * found later, this identifies exactly which labels are suspect.
   */
  parserVersion: z.string(),
});
export type Label = z.infer<typeof Label>;

/* ═══════════════════════════════════════════════════════════════════
   Batch
   ═══════════════════════════════════════════════════════════════════ */

export const Batch = z.object({
  id: z.string(),
  /** Human-facing reference, e.g. "B-2847". */
  ref: z.string(),
  fileName: z.string(),
  pageCount: z.number().int().nonnegative(),
  /** ISO timestamp. */
  importedAt: z.string(),
  /** ISO timestamp of the most recent print, or null if never printed. */
  printedAt: z.string().nullable(),
  operator: z.string(),
  labels: z.array(Label),
});
export type Batch = z.infer<typeof Batch>;

/* ═══════════════════════════════════════════════════════════════════
   Template settings
   ═══════════════════════════════════════════════════════════════════ */

export const PaperSize = z.enum(['A4', 'Letter']);
export type PaperSize = z.infer<typeof PaperSize>;

export const TemplateSettings = z.object({
  /** Labels per row on the print sheet. Genuinely drives print output. */
  labelsPerRow: z.union([z.literal(1), z.literal(2)]),
  paperSize: PaperSize,
  /** Page margin in millimetres. */
  marginMm: z.number().min(0).max(40),
  /** Add the batch reference to each label for traceability. */
  includeBatchRef: z.boolean(),
  /**
   * Block printing until every flagged label has been reviewed.
   * Defaults ON — this is the guard against shipping bad labels.
   */
  requireVerification: z.boolean(),
  /** Name recorded as the operator on new imports. */
  operatorName: z.string(),
});
export type TemplateSettings = z.infer<typeof TemplateSettings>;

export const DEFAULT_SETTINGS: TemplateSettings = {
  labelsPerRow: 2,
  paperSize: 'A4',
  marginMm: 12,
  includeBatchRef: true,
  requireVerification: true,
  operatorName: 'Operator',
};

/* ═══════════════════════════════════════════════════════════════════
   Derived helpers
   ═══════════════════════════════════════════════════════════════════ */

/** A label blocks printing if it has an unresolved blocking reason. */
export function isBlocked(label: Label): boolean {
  if (label.reviewed) return false;
  return label.reviewReasons.some((r) => BLOCKING_REASONS.has(r));
}

/** A label needs attention if it has any reason and has not been reviewed. */
export function needsReview(label: Label): boolean {
  return !label.reviewed && label.reviewReasons.length > 0;
}

/** Labels that will actually be sent to the printer. */
export function printableLabels(labels: Label[], requireVerification: boolean): Label[] {
  return labels.filter((l) => {
    if (!l.selected) return false;
    if (requireVerification && isBlocked(l)) return false;
    return true;
  });
}

/** Single-line destination summary for table rows. */
export function destinationOf(label: Label): string {
  const { postalCode, city, country } = label.address;
  const place = [postalCode, city].filter(Boolean).join(' ');
  const parts = [place || null, country.value].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** Summary counts used across the UI. */
export interface BatchStats {
  total: number;
  clean: number;
  needsReview: number;
  selected: number;
}

export function statsFor(labels: Label[]): BatchStats {
  let clean = 0;
  let review = 0;
  let selected = 0;
  for (const l of labels) {
    if (needsReview(l)) review += 1;
    else clean += 1;
    if (l.selected) selected += 1;
  }
  return { total: labels.length, clean, needsReview: review, selected };
}
