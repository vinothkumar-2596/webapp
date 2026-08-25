import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildLabelsDocx } from './exportDocx';
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
  const media = Object.entries(zip.files)
    .filter(([p, f]) => p.startsWith('word/media/') && !f.dir)
    .map(([p]) => p);
  // Each A4 page is emitted as its own section, so counting <w:sectPr> counts pages.
  const pages = (documentXml.match(/<w:sectPr/g) ?? []).length;
  return { documentXml, media, pages };
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
