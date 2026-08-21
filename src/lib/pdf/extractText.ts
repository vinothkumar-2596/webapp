import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { getPdfWorker } from './worker';
import { runsToLines, type PageText } from './lines';
import { PdfError, toPdfError } from './errors';

export { runsToLines } from './lines';
export type { Run, PageText } from './lines';

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_PAGES = 200;

/** Progress callback: fired after each page is read. */
export type ProgressFn = (page: number, total: number) => void;

/** Read a File/Blob into an ArrayBuffer, with a FileReader fallback for old iOS. */
async function readBytes(file: File | Blob): Promise<ArrayBuffer> {
  if (file.size === 0) throw new PdfError('EMPTY_FILE');
  if (file.size > MAX_FILE_BYTES) throw new PdfError('TOO_LARGE');

  try {
    return await file.arrayBuffer();
  } catch {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}

/**
 * Verify the %PDF magic bytes before handing anything to pdf.js.
 *
 * v1 read 4 bytes unconditionally, which threw a RangeError on any file
 * smaller than that — surfacing as a generic error instead of "not a PDF".
 */
function assertPdfHeader(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 5) throw new PdfError('NOT_PDF');
  const head = new Uint8Array(buffer, 0, 5);
  const ok =
    head[0] === 0x25 && // %
    head[1] === 0x50 && // P
    head[2] === 0x44 && // D
    head[3] === 0x46 && // F
    head[4] === 0x2d; //  -
  if (!ok) throw new PdfError('NOT_PDF');
}

/**
 * Extract text from a PDF, page by page, reconstructed into visual lines.
 *
 * Everything happens in the browser — the file is never uploaded.
 */
export async function extractPdfText(
  file: File | Blob,
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<PageText[]> {
  const buffer = await readBytes(file);
  assertPdfHeader(buffer);

  const task = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    worker: getPdfWorker(),
    // Packing slips are text documents; skip resources we never read.
    disableFontFace: true,
  });

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (err) {
    void task.destroy();
    throw toPdfError(err);
  }

  try {
    if (doc.numPages === 0) throw new PdfError('NO_PAGES');
    if (doc.numPages > MAX_PAGES) throw new PdfError('TOO_MANY_PAGES');

    const pages: PageText[] = [];

    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const page = await doc.getPage(n);
      try {
        const content = await page.getTextContent();

        const runs = [];
        for (const item of content.items) {
          const t = item as TextItem;
          if (typeof t.str !== 'string' || t.str.trim().length === 0) continue;
          const tx = t.transform;
          if (!tx) continue;
          runs.push({
            x: tx[4] ?? 0,
            y: tx[5] ?? 0,
            text: t.str,
            width: typeof t.width === 'number' ? t.width : 0,
          });
        }

        const lines = runsToLines(runs);
        pages.push({ pageNumber: n, lines, raw: lines.join('\n') });
      } finally {
        page.cleanup();
      }

      onProgress?.(n, doc.numPages);
    }

    // A PDF with no selectable text anywhere is a scan — say so explicitly
    // rather than emitting a page of empty labels.
    if (pages.every((p) => p.lines.length === 0)) {
      throw new PdfError('NO_TEXT');
    }

    return pages;
  } finally {
    await task.destroy();
  }
}
