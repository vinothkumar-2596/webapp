import { extractPdfText, type ProgressFn } from './extractText';
import { parseSlip } from './parseSlip';
import { toPdfError } from './errors';
import { newId } from '../id';
import type { Batch, Label } from '../types';

/** Sequence number for batch references, persisted alongside batches. */
function batchRef(seq: number): string {
  return `B-${String(seq).padStart(4, '0')}`;
}

export interface ImportOptions {
  operator: string;
  /** Monotonic counter used to build the human-facing batch reference. */
  sequence: number;
  onProgress?: ProgressFn;
  signal?: AbortSignal;
}

/**
 * Import a packing-slip PDF into a Batch.
 *
 * Every page becomes exactly one Label. Unlike v1, a page that cannot be
 * parsed still produces a Label — flagged with review reasons and
 * deselected — rather than being silently dropped or filled with invented
 * data. The operator sees precisely what failed and fixes it.
 */
export async function importPdf(file: File, opts: ImportOptions): Promise<Batch> {
  try {
    const pages = await extractPdfText(file, opts.onProgress, opts.signal);
    const labels: Label[] = pages.map((p) => parseSlip(p));

    return {
      id: newId(),
      ref: batchRef(opts.sequence),
      fileName: file.name,
      pageCount: pages.length,
      importedAt: new Date().toISOString(),
      printedAt: null,
      operator: opts.operator,
      labels,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw toPdfError(err);
  }
}

export { statsFor, type BatchStats } from '../types';
