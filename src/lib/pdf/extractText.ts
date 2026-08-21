// legacy/ build — see the note in ./worker.ts. Both scopes must use it.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { getPdfWorker } from './worker';
import { runsToLines, type Run, type PageText } from './lines';
import { PdfError, toPdfError } from './errors';

/** One page of a PDF, reconstructed into visual lines. */
export interface PageText {
  pageNumber: number;
  /** Lines top-to-bottom, each reading left-to-right. */
  lines: string[];
  /** All lines joined by \n. Convenience for whole-page regex matching. */
  raw: string;
}

export { runsToLines } from './lines';
export type { Run } from './lines';

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_PAGES = 200;

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

/** Verify the %PDF magic bytes before handing anything to pdf.js. */
function assertPdfHeader(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 5) throw new PdfError('NOT_PDF');
  const head = new Uint8Array(buffer, 0, 5);
  // "%PDF-"
  const ok =
    head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d;
  if (!ok) throw new PdfError('NOT_PDF');
}

/** Progress callback: fired after each page is read. */
export type ProgressFn = (page: number, total: number) => void;

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

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      worker: getPdfWorker(),
      // Packing slips are text documents; skip resources we never read.
      disableFontFace: true,
      isEvalSupported: false,
    });
    doc = await task.promise;
  } catch (err) {
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

        const runs: Run[] = [];
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
    await doc.destroy();
  }
}
