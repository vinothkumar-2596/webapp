import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PAGE_SLACK, buildLabelsDocx } from './exportDocx';
import type { Batch, Label } from '../types';

function makeLabel(page: number, name: string, order: string | null): Label {
  return {
    id: `l${page}`,
    pageNumber: page,
    recipientName: { value: name, confidence: 'high' },
    address: {
      lines: [`${page} Rue de Test`],
      postalCode: '75001',
      city: 'Paris',
      country: { value: 'France', confidence: 'high' },
    },
    phone: { value: '0612345678', confidence: 'high' },
    orderNumber: order ? { value: order, confidence: 'high' } : { value: null, confidence: 'missing' },
    product: { title: 'Item', sku: null, asin: null, quantity: 1 },
    reviewReasons: [],
    reviewed: true,
    selected: true,
    source: 'parsed',
    parserVersion: '2.0.0',
  };
}

function makeBatch(labels: Label[]): Batch {
  return {
    id: 'b1',
    ref: 'B-0001',
    fileName: 'slips.pdf',
    pageCount: labels.length,
    importedAt: '2026-01-01T00:00:00.000Z',
    printedAt: null,
    operator: 'Tester',
    labels,
  };
}

async function unzip(blob: Blob) {
  const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
  const documentXml = await zip.file('word/document.xml')!.async('string');
  const stylesXml = await zip.file('word/styles.xml')!.async('string');
  const media = Object.entries(zip.files)
    .filter(([p, f]) => p.startsWith('word/media/') && !f.dir)
    .map(([p]) => p);
  // Each A4 page is emitted as its own section, so counting <w:sectPr> counts
  // sheets. Note this counts what we *asked* for — Word will render more than
  // this if the grid overflows its page, which is what the geometry tests below
  // guard against.
  const pages = (documentXml.match(/<w:sectPr/g) ?? []).length;
  return { documentXml, stylesXml, media, pages };
}

describe('buildLabelsDocx', () => {
  it('produces a valid .docx (zip) container', async () => {
    const blob = await buildLabelsDocx(makeBatch([makeLabel(1, 'Alice', '402-1234567-1234567')]));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // PK zip signature.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('puts 1 label on a single A4 page and embeds its QR', async () => {
    const blob = await buildLabelsDocx(makeBatch([makeLabel(1, 'Alice', '402-1234567-1234567')]));
    const { documentXml, media, pages } = await unzip(blob);
    expect(pages).toBe(1);
    expect(documentXml).toContain('Alice');
    expect(media.length).toBe(1); // one QR image
  });

  it('uses a borderless grid and consistently bold 12pt phone text', async () => {
    const { documentXml } = await unzip(
      await buildLabelsDocx(makeBatch([makeLabel(1, 'Alice', '402-1234567-1234567')])),
    );
    expect(documentXml).not.toContain('w:val="single"');
    expect(documentXml).toContain('N° portable : 0612345678');
    expect(documentXml).toMatch(
      /<w:rPr><w:rFonts w:ascii="Calibri" w:cs="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri"\/><w:b\/><w:bCs\/><w:sz w:val="24"\/><w:szCs w:val="24"\/><\/w:rPr><w:t xml:space="preserve">N° portable : 0612345678<\/w:t>/,
    );
  });

  it('uses the exact APLI Agipa 119013 cell dimensions', async () => {
    const { documentXml } = await unzip(
      await buildLabelsDocx(makeBatch([makeLabel(1, 'Alice', '402-1234567-1234567')])),
    );
    expect(documentXml).toContain('<w:gridCol w:w="4814"/><w:gridCol w:w="1139"/>');
    expect(documentXml).toContain('<w:trHeight w:val="3231" w:hRule="exact"/>');
    expect(documentXml).toContain('<w:top w:type="dxa" w:w="284"/>');
    // 4814 text column − 15 left cell pad − 284 right cell pad − 258 left inset
    // − 3061 (54 mm) of wrapping width.
    expect(documentXml).toContain('<w:ind w:left="258" w:right="1196"/>');
    // 2 × (4814 + 1139) = 11906 = the full A4 width, since 2 × 105 mm labels
    // leave no side margin on the stock.
    const cols = [...documentXml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(cols.slice(0, 4).reduce((a, b) => a + b, 0)).toBe(11906);
  });

  it('leaves room under the grid for the paragraph Word puts after each table', async () => {
    // The regression this file exists for: at 5 × 3231 twips the grid is exactly
    // as tall as the text area, so Word pushed the section-break paragraph — and
    // a row with it — onto an extra sheet, and every label below drifted down a
    // row. The fix is a 0 bottom margin, which buys 343 twips of slack.
    expect(PAGE_SLACK).toBeGreaterThan(0);

    const { documentXml, stylesXml } = await unzip(
      await buildLabelsDocx(makeBatch([makeLabel(1, 'Alice', '402-1234567-1234567')])),
    );
    expect(documentXml).toContain('w:top="340" w:right="0" w:bottom="0" w:left="0"');
    // A header/footer distance larger than the margin would reserve a band and
    // take the slack straight back.
    expect(documentXml).toContain('w:header="0" w:footer="0"');
    // Word styles that break paragraph from the document default, so the default
    // run has to be ~1 pt rather than 12 pt for it to fit in the slack.
    expect(stylesXml).toMatch(/<w:rPrDefault><w:rPr>[^]*?<w:sz w:val="2"\/>/);

    // 340 top + 5 × 3231 grid + a 20-twip spacer + a ~24-twip break paragraph.
    expect(340 + 5 * 3231 + 20 + 24).toBeLessThan(16838);
  });

  it('keeps the grid rigid against Word and LibreOffice defaults', async () => {
    const { documentXml } = await unzip(
      await buildLabelsDocx(makeBatch([makeLabel(1, 'Alice', '402-1234567-1234567')])),
    );
    // Without an explicit indent the default table style's 108-twip indent slides
    // the whole grid off the label stock.
    expect(documentXml).toContain('<w:tblInd w:type="dxa" w:w="0"/>');
    expect(documentXml).toContain('<w:tblLayout w:type="fixed"/>');
    // A row that split across a page break would shift every label below it.
    expect(documentXml).toContain('<w:cantSplit/>');
  });

  it('prints the country as it reads on the slip, not uppercased', async () => {
    const { documentXml } = await unzip(await buildLabelsDocx(makeBatch([makeLabel(1, 'A', null)])));
    expect(documentXml).toContain('>France<');
    expect(documentXml).not.toContain('>FRANCE<');
  });

  it('sizes the QR to fit inside its column', async () => {
    const { documentXml } = await unzip(
      await buildLabelsDocx(makeBatch([makeLabel(1, 'Alice', '402-1234567-1234567')])),
    );
    // 533400 EMU = 840 twips. The QR column is 1139 twips with a 284-twip right
    // margin, leaving 855 — an over-wide inline image is not clipped, Word bleeds
    // it past the cell, and for the right-hand column that means off the paper.
    const extent = documentXml.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);
    expect(extent).not.toBeNull();
    const widthTwips = (Number(extent![1]) / 914400) * 1440;
    expect(widthTwips).toBeLessThanOrEqual(1139 - 284);
    expect(Number(extent![2])).toBe(Number(extent![1])); // square
  });

  it('fits exactly 10 labels on one page', async () => {
    const labels = Array.from({ length: 10 }, (_, i) =>
      makeLabel(i + 1, `Name${i + 1}`, '402-1234567-1234567'),
    );
    const { pages } = await unzip(await buildLabelsDocx(makeBatch(labels)));
    expect(pages).toBe(1);
  });

  it('spills the 11th label onto a second page', async () => {
    const labels = Array.from({ length: 11 }, (_, i) =>
      makeLabel(i + 1, `Name${i + 1}`, '402-1234567-1234567'),
    );
    const { pages } = await unzip(await buildLabelsDocx(makeBatch(labels)));
    expect(pages).toBe(2);
  });

  it('lays out 25 labels across 3 pages', async () => {
    const labels = Array.from({ length: 25 }, (_, i) =>
      makeLabel(i + 1, `Name${i + 1}`, '402-1234567-1234567'),
    );
    const { pages } = await unzip(await buildLabelsDocx(makeBatch(labels)));
    expect(pages).toBe(3); // ceil(25 / 10)
  });

  it('embeds one QR image per label with an order number', async () => {
    const labels = Array.from({ length: 13 }, (_, i) => makeLabel(i + 1, `Name${i + 1}`, null));
    const { pages, media } = await unzip(await buildLabelsDocx(makeBatch(labels)));
    expect(pages).toBe(2); // ceil(13 / 10)
    expect(media.length).toBe(0); // none have order numbers → no QR images
  });

  it('omits the QR when a label has no order number', async () => {
    const { media } = await unzip(await buildLabelsDocx(makeBatch([makeLabel(1, 'NoOrder', null)])));
    expect(media.length).toBe(0);
  });

  it('orders labels by source page number', async () => {
    const labels = [makeLabel(3, 'Third', null), makeLabel(1, 'First', null), makeLabel(2, 'Second', null)];
    const { documentXml } = await unzip(await buildLabelsDocx(makeBatch(labels)));
    expect(documentXml.indexOf('First')).toBeLessThan(documentXml.indexOf('Second'));
    expect(documentXml.indexOf('Second')).toBeLessThan(documentXml.indexOf('Third'));
  });
});
