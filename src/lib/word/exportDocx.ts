import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import QRCode from 'qrcode';
import type { Batch, Label } from '../types';

/* ═══════════════════════════════════════════════════════════════════
   Word (.docx) label export

   The downloadable output the client asked for. It is a real Word
   document — every field (name, address, phone, order number) is plain,
   editable text — laid out on a FIXED A4 grid:

       A4 portrait · 2 columns × 5 rows · 10 label cells per page

   Within each cell the recipient details are left-aligned and the QR sits
   on the right. The cell size is constant regardless of how many labels
   there are. One PDF page → one label → one cell, filled left-to-right,
   top-to-bottom. Page 1 takes labels 1–10, page 2 takes 11–20, and so on;
   the last page's unused cells are left blank at the same fixed size.

   Layout only — the on-screen Edit/Delete controls never reach here.
   ═══════════════════════════════════════════════════════════════════ */

// Geometry in twips (twentieths of a point). 1 inch = 1440 twips, and
// 1 mm ≈ 56.6929 twips, so A4 (210 × 297 mm) is exactly:
const A4_WIDTH = 11906;
const A4_HEIGHT = 16838;
// APLI Agipa 119013 stock: 2 × 105 mm labels across A4, 5 × 57 mm down.
// The remaining 12 mm is split into 6 mm at the top and bottom.
const TOP_MARGIN = 340;
const BOTTOM_MARGIN = 343;

const COLS = 2;
const ROWS = 5;
const PER_PAGE = COLS * ROWS; // 10

const CONTENT_WIDTH = A4_WIDTH;
const COL_WIDTH = Math.floor(A4_WIDTH / COLS); // exactly 105 mm per label
const ROW_HEIGHT = 3231; // 57 mm per label

// Each label is represented by a text column and a QR column in the one outer
// table. Avoiding nested tables keeps these widths stable in Word for iOS.
const QR_COL_W = 1100; // ~1.9 cm column for the QR on the right
const TEXT_COL_W = COL_WIDTH - QR_COL_W;
const CELL_TOP_PAD = 284; // 5 mm, matching the supplied APLI template
const CELL_LEFT_PAD = 15; // 0.26 mm
const CELL_RIGHT_PAD = 284; // 5 mm
const PARAGRAPH_INSET = 258; // 4.55 mm on both sides

const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const NO_TABLE_BORDERS = {
  top: NONE_BORDER,
  bottom: NONE_BORDER,
  left: NONE_BORDER,
  right: NONE_BORDER,
  insideHorizontal: NONE_BORDER,
  insideVertical: NONE_BORDER,
} as const;
const NO_CELL_BORDERS = {
  top: NONE_BORDER,
  bottom: NONE_BORDER,
  left: NONE_BORDER,
  right: NONE_BORDER,
} as const;

interface Entry {
  label: Label;
  /** Rasterised QR PNG, or null when the label has no order number. */
  qr: Uint8Array | null;
}

/** Split a flat list into fixed-size pages. */
function paginate<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

/** Render an order number to PNG bytes for embedding in the document. */
async function renderQr(order: string): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(order, {
    // A clear white quiet-zone keeps the printed QR distinct from label text,
    // matching the reference sheet and improving scan reliability.
    margin: 3,
    width: 240,
    errorCorrectionLevel: 'M',
  });
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The street lines with the postal/city line removed, matching ShipLabel. */
function streetLinesOf(label: Label): string[] {
  const place = [label.address.postalCode, label.address.city].filter(Boolean).join(' ');
  if (!place) return label.address.lines;
  const normalise = (v: string) => v.split(' ').filter(Boolean).join(' ').toLowerCase();
  return label.address.lines.filter((line) => normalise(line) !== normalise(place));
}

function line(text: string, opts: { bold?: boolean; size?: number; font?: string } = {}): Paragraph {
  return new Paragraph({
    // Match Word's "No Spacing" paragraph style: compact consecutive lines
    // with no empty paragraph gap between address fields.
    spacing: { before: 0, after: 0, line: 240 },
    indent: { left: PARAGRAPH_INSET, right: PARAGRAPH_INSET },
    children: [
      new TextRun({
        text,
        bold: opts.bold ?? true,
        size: opts.size ?? 24, // half-points → 12pt default
        font: opts.font ?? 'Calibri',
      }),
    ],
  });
}

/** The text half of one label. */
function textCell({ label }: Entry): TableCell {
  const textParas: Paragraph[] = [];

  textParas.push(line(label.recipientName.value ?? 'No recipient name'));

  const place = [label.address.postalCode, label.address.city].filter(Boolean).join(' ');
  for (const l of streetLinesOf(label)) textParas.push(line(l));
  if (place) textParas.push(line(place));
  if (label.address.country.value) {
    textParas.push(line(label.address.country.value.toUpperCase()));
  }

  if (label.phone.value) {
    const phone = `N° portable : ${label.phone.value}`;
    textParas.push(line(phone));
  }

  return new TableCell({
    width: { size: TEXT_COL_W, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    borders: NO_CELL_BORDERS,
    margins: {
      top: CELL_TOP_PAD,
      bottom: 0,
      left: CELL_LEFT_PAD,
      right: CELL_RIGHT_PAD,
    },
    children: textParas,
  });
}

/** The QR half of one label. */
function qrCell(qr: Uint8Array | null): TableCell {
  return new TableCell({
    width: { size: QR_COL_W, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    borders: NO_CELL_BORDERS,
    margins: { top: CELL_TOP_PAD, bottom: 0, left: 0, right: CELL_RIGHT_PAD },
    children: [
      qr
        ? new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({ type: 'png', data: qr, transformation: { width: 58, height: 58 } }),
            ],
          })
        : new Paragraph(''),
    ],
  });
}

function emptyTextCell(): TableCell {
  return new TableCell({
    width: { size: TEXT_COL_W, type: WidthType.DXA },
    borders: NO_CELL_BORDERS,
    margins: { top: CELL_TOP_PAD, bottom: 0, left: CELL_LEFT_PAD, right: CELL_RIGHT_PAD },
    children: [new Paragraph('')],
  });
}

/** The borderless 2 × 5 grid for a single A4 page. */
function pageTable(entries: Entry[]): Table {
  const rows: TableRow[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    const cells: TableCell[] = [];
    for (let c = 0; c < COLS; c += 1) {
      const entry = entries[r * COLS + c];
      cells.push(entry ? textCell(entry) : emptyTextCell(), qrCell(entry?.qr ?? null));
    }
    rows.push(
      new TableRow({ height: { value: ROW_HEIGHT, rule: HeightRule.EXACT }, children: cells }),
    );
  }
  return new Table({
    layout: TableLayoutType.FIXED,
    columnWidths: [TEXT_COL_W, QR_COL_W, TEXT_COL_W, QR_COL_W],
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    borders: NO_TABLE_BORDERS,
    rows,
  });
}

function safeFileName(batch: Batch): string {
  const base = (batch.ref || batch.fileName || 'labels').replace(/[^a-z0-9._-]+/gi, '-');
  return `${base}-labels.docx`;
}

/** Build the .docx blob for a batch. Exported for testing. */
export async function buildLabelsDocx(batch: Batch): Promise<Blob> {
  // One PDF page = one label = one cell, in page order.
  const ordered = [...batch.labels].sort((a, b) => a.pageNumber - b.pageNumber);

  const entries: Entry[] = await Promise.all(
    ordered.map(async (label) => ({
      label,
      qr: label.orderNumber.value ? await renderQr(label.orderNumber.value) : null,
    })),
  );

  // Always at least one page so an empty batch still yields a valid sheet.
  const pages = entries.length > 0 ? paginate(entries, PER_PAGE) : [[]];

  // One section per page → each A4 page starts cleanly on its own page,
  // independent of how much content a cell happens to hold.
  const sections = pages.map((page) => ({
    properties: {
      page: {
        size: { width: A4_WIDTH, height: A4_HEIGHT, orientation: PageOrientation.PORTRAIT },
        // Keep header/footer distances well inside the page margin so Word
        // doesn't reserve its default header/footer band and steal vertical
        // space from the grid (which would push the third row off the page).
        margin: {
          top: TOP_MARGIN,
          bottom: BOTTOM_MARGIN,
          left: 0,
          right: 0,
          header: 283,
          footer: 283,
        },
      },
    },
    children: [pageTable(page)],
  }));

  const doc = new Document({ sections });
  return Packer.toBlob(doc);
}

/** Build the document and trigger a browser download. */
export async function downloadLabelsDocx(batch: Batch): Promise<void> {
  const blob = await buildLabelsDocx(batch);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(batch);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
