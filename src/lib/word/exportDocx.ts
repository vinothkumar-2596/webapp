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

       A4 portrait · 2 columns × 3 rows · 6 label cells per page

   The cell size is constant regardless of how many labels there are.
   One PDF page → one label → one cell, filled left-to-right, top-to-
   bottom. Page 1 takes labels 1–6, page 2 takes 7–12, and so on; the
   last page's unused cells are left blank at the same fixed size.

   Layout only — the on-screen Edit/Delete controls never reach here.
   ═══════════════════════════════════════════════════════════════════ */

// Geometry in twips (twentieths of a point). 1 inch = 1440 twips, and
// 1 mm ≈ 56.6929 twips, so A4 (210 × 297 mm) is exactly:
const A4_WIDTH = 11906;
const A4_HEIGHT = 16838;
const MARGIN = 567; // ~10 mm all round

const COLS = 2;
const ROWS = 3;
const PER_PAGE = COLS * ROWS; // 6

const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const CONTENT_HEIGHT = A4_HEIGHT - MARGIN * 2;

// Height held back below the 3-row grid. Word adds per-cell margins and always
// appends a paragraph after a table (the one that carries the section break),
// so a grid sized to the full content height ends up a hair too tall — the
// third row spills onto a second physical page and each sheet prints only 4
// labels instead of 6. Reserving this slack keeps all three rows on one page.
const GRID_RESERVE = 1700;

const COL_WIDTH = Math.floor(CONTENT_WIDTH / COLS); // fixed cell width
const ROW_HEIGHT = Math.floor((CONTENT_HEIGHT - GRID_RESERVE) / ROWS); // fixed cell height

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' } as const;

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
    margin: 1,
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
    spacing: { after: 30 },
    children: [
      new TextRun({
        text,
        bold: opts.bold ?? false,
        size: opts.size ?? 18, // half-points → 9pt default
        font: opts.font ?? 'Arial',
      }),
    ],
  });
}

/** One filled label cell. */
function labelCell({ label, qr }: Entry): TableCell {
  const children: Paragraph[] = [];

  // QR on top, centred — then the recipient details beneath it.
  if (qr) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new ImageRun({ type: 'png', data: qr, transformation: { width: 110, height: 110 } }),
        ],
      }),
    );
  }

  children.push(line(label.recipientName.value ?? 'No recipient name', { bold: true, size: 22 }));

  const place = [label.address.postalCode, label.address.city].filter(Boolean).join(' ');
  for (const l of streetLinesOf(label)) children.push(line(l));
  if (place) children.push(line(place));
  if (label.address.country.value) {
    children.push(line(label.address.country.value.toUpperCase(), { bold: true }));
  }

  if (label.phone.value) {
    const phone = label.phoneIsMobile ? `N° portable : ${label.phone.value}` : label.phone.value;
    children.push(line(phone, { bold: true }));
  }

  return new TableCell({
    width: { size: COL_WIDTH, type: WidthType.DXA },
    // Same concept as the web / A4 preview: the QR + details block is centred
    // vertically in the cell (justify-content: center on screen == vAlign
    // center here), the QR centred on top, the address left-aligned beneath.
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 160, right: 160 },
    children,
  });
}

/** A blank cell — keeps the grid at its fixed size when a page isn't full. */
function emptyCell(): TableCell {
  return new TableCell({
    width: { size: COL_WIDTH, type: WidthType.DXA },
    children: [new Paragraph('')],
  });
}

/** The 2 × 3 grid for a single A4 page. */
function pageTable(entries: Entry[]): Table {
  const rows: TableRow[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    const cells: TableCell[] = [];
    for (let c = 0; c < COLS; c += 1) {
      const entry = entries[r * COLS + c];
      cells.push(entry ? labelCell(entry) : emptyCell());
    }
    rows.push(
      new TableRow({ height: { value: ROW_HEIGHT, rule: HeightRule.EXACT }, children: cells }),
    );
  }
  return new Table({
    layout: TableLayoutType.FIXED,
    columnWidths: [COL_WIDTH, COL_WIDTH],
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    borders: {
      top: CELL_BORDER,
      bottom: CELL_BORDER,
      left: CELL_BORDER,
      right: CELL_BORDER,
      insideHorizontal: CELL_BORDER,
      insideVertical: CELL_BORDER,
    },
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
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 283, footer: 283 },
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
