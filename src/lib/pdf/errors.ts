/**
 * Typed PDF errors.
 *
 * Every failure mode gets a stable code and an operator-facing message with
 * concrete next steps. v1 produced a generic "Erreur de lecture" box that,
 * for the most common case, rendered completely empty.
 */

export type PdfErrorCode =
  | 'EMPTY_FILE'
  | 'NOT_PDF'
  | 'TOO_LARGE'
  | 'TOO_MANY_PAGES'
  | 'ENCRYPTED'
  | 'CORRUPT'
  | 'NO_TEXT'
  | 'NO_PAGES'
  | 'WORKER_FAILED'
  | 'UNKNOWN';

export interface PdfErrorDetail {
  code: PdfErrorCode;
  /** Short headline shown in the alert bar. */
  title: string;
  /** One or two sentences explaining what happened. */
  message: string;
  /** Concrete things the operator can try, shown as a list. */
  hints: string[];
}

const DETAILS: Record<PdfErrorCode, Omit<PdfErrorDetail, 'code'>> = {
  EMPTY_FILE: {
    title: 'File is empty',
    message: 'The selected file contains no data, so nothing could be imported.',
    hints: [
      'On iPhone or iPad, make sure the PDF is downloaded to the device and not only stored in iCloud.',
      'Re-download the file from Seller Central and try again.',
    ],
  },
  NOT_PDF: {
    title: 'Not a PDF file',
    message: 'This file is not a PDF. Only PDF packing slips can be imported.',
    hints: [
      'Check the file extension — it must be .pdf.',
      'If you exported from a spreadsheet or email, save it as a PDF first.',
    ],
  },
  TOO_LARGE: {
    title: 'File is too large',
    message: 'The PDF exceeds the maximum supported size and was not imported.',
    hints: [
      'Split the file into smaller batches and import them separately.',
      'Re-export from Seller Central rather than scanning to PDF, which produces much larger files.',
    ],
  },
  TOO_MANY_PAGES: {
    title: 'Too many pages',
    message: 'The PDF has more pages than a single batch supports.',
    hints: ['Split the file into batches and import them one at a time.'],
  },
  ENCRYPTED: {
    title: 'PDF is password-protected',
    message: 'This PDF is encrypted, so its pages could not be read. Nothing was imported.',
    hints: [
      'Remove the password protection before uploading.',
      'Re-export the file from Seller Central, which produces an unprotected PDF.',
    ],
  },
  CORRUPT: {
    title: 'PDF could not be read',
    message: 'The PDF structure is damaged, so no pages could be read. Nothing was imported.',
    hints: [
      'Re-export the file from Seller Central rather than printing to PDF.',
      'Confirm the download completed — a truncated file will fail here.',
    ],
  },
  NO_TEXT: {
    title: 'No text found in this PDF',
    message:
      'The pages contain no selectable text. This usually means the PDF is a scan or an image export.',
    hints: [
      'Export the packing slips directly from Seller Central instead of scanning them.',
      'Do not print to PDF from an image viewer — that discards the text layer.',
      'Addresses can still be entered manually.',
    ],
  },
  NO_PAGES: {
    title: 'PDF has no pages',
    message: 'The document opened successfully but contains zero pages.',
    hints: ['Check that the correct file was selected.'],
  },
  WORKER_FAILED: {
    title: 'PDF engine failed to start',
    message: 'The in-browser PDF engine could not be initialised, so parsing was not attempted.',
    hints: [
      'Reload the page and try again.',
      'If this persists, the browser may be blocking web workers — check privacy extensions.',
    ],
  },
  UNKNOWN: {
    title: 'Import failed',
    message: 'An unexpected error occurred while reading the PDF. Nothing was imported.',
    hints: ['Try the file again.', 'If it keeps failing, re-export it from Seller Central.'],
  },
};

export class PdfError extends Error {
  readonly code: PdfErrorCode;
  readonly detail: PdfErrorDetail;

  constructor(code: PdfErrorCode, cause?: unknown) {
    const d = DETAILS[code];
    super(d.message, { cause });
    this.name = 'PdfError';
    this.code = code;
    this.detail = { code, ...d };
  }
}

/** Map an unknown thrown value onto a typed PdfError. */
export function toPdfError(err: unknown): PdfError {
  if (err instanceof PdfError) return err;

  const name = (err as { name?: string } | null)?.name ?? '';
  const message = String((err as { message?: string } | null)?.message ?? err ?? '');

  if (name === 'PasswordException' || /password/i.test(message)) {
    return new PdfError('ENCRYPTED', err);
  }
  if (name === 'InvalidPDFException' || /invalid pdf|structure/i.test(message)) {
    return new PdfError('CORRUPT', err);
  }
  if (/worker/i.test(message)) {
    return new PdfError('WORKER_FAILED', err);
  }
  return new PdfError('UNKNOWN', err);
}
