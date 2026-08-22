import { useCallback, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, Upload } from 'lucide-react';
import { useStore } from '../app/store';
import { cn } from '../components/ui';
import { PdfError, toPdfError } from '../lib/pdf/errors';
import { nextSequence } from '../lib/storage';
import { isInstalledApp } from '../lib/installWindow';

/**
 * Upload screen, in the original v1 presentation.
 *
 * Reproduces v1's card: muted header strip, the numbered "How it works"
 * list, and a dashed drop zone with the emerald call to action.
 *
 * The parsing underneath is unchanged — typed errors, cancellation and the
 * iOS fixes all stay. Only the presentation is v1's; the engine is not.
 */

const STEPS = [
  'Upload your Amazon PDF (each page = one packing slip).',
  'We extract each recipient address & order details automatically.',
  'A QR label is generated per page — ready to print.',
  'Scan the QR to instantly view the order number.',
];

type Phase =
  | { kind: 'idle' }
  | { kind: 'parsing'; page: number; total: number; fileName: string }
  | { kind: 'error'; error: PdfError };

export function ImportScreen() {
  const { dispatch, settings } = useStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      const looksPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!looksPdf) {
        setPhase({ kind: 'error', error: new PdfError('NOT_PDF') });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setPhase({ kind: 'parsing', page: 0, total: 0, fileName: file.name });

      try {
        const [{ importPdf }, sequence] = await Promise.all([
          import('../lib/pdf/importPdf'),
          nextSequence(),
        ]);

        const batch = await importPdf(file, {
          operator: settings.operatorName,
          sequence,
          signal: controller.signal,
          onProgress: (page, total) =>
            setPhase({ kind: 'parsing', page, total, fileName: file.name }),
        });
        // addBatch also opens the new batch and switches screen.
        dispatch({ type: 'addBatch', batch });
        setPhase({ kind: 'idle' });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setPhase({ kind: 'idle' });
          return;
        }
        setPhase({ kind: 'error', error: toPdfError(err) });
      } finally {
        abortRef.current = null;
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [dispatch, settings.operatorName],
  );

  const busy = phase.kind === 'parsing';

  return (
    <section
      className={cn(
        'mx-auto flex w-full max-w-[1280px] flex-col items-center justify-center px-3 py-4 sm:px-5 sm:py-7',
        // No header when installed → centre in the full viewport height.
        isInstalledApp() ? 'min-h-dvh' : 'min-h-[calc(100dvh-56px)]',
      )}
    >
      <div className="w-full max-w-[520px]">
        <div className="overflow-hidden rounded-[18px] border border-[#e0e0de] bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.07)]">
          {/* Card header */}
          <div className="flex items-center justify-between gap-2 border-b border-[#e8e8e6] bg-[#f9f9f7] px-4 py-3 sm:px-[22px] sm:py-3.5">
            <div className="flex min-w-0 items-center gap-[7px]">
              <FileText size={16} className="shrink-0 text-brand" />
              <span className="font-display truncate text-[13px] font-bold text-[#111827] sm:text-[15px]">
                Upload Amazon Packing Slip PDF
              </span>
            </div>
            <span className="shrink-0 rounded-full border border-[#e0e0de] bg-surface px-2.5 py-0.5 text-[10px] font-bold text-[#6b7280]">
              Vape de France
            </span>
          </div>

          {/* How it works */}
          <div className="px-4 pt-3.5 pb-1.5 sm:px-[22px] sm:pt-[18px]">
            <p className="m-0 mb-2.5 text-[10px] font-bold tracking-[0.08em] text-brand uppercase">
              How it works
            </p>
            <ol className="m-0 flex list-none flex-col gap-[9px] p-0">
              {STEPS.map((text, i) => (
                <li key={text} className="flex items-start gap-2.5">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-extrabold text-white">
                    {i + 1}
                  </span>
                  <span className="text-[12px] leading-[1.55] text-[#374151]">{text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Drop zone */}
          <div className="px-4 pt-3.5 pb-[18px] sm:px-[22px] sm:pt-[18px] sm:pb-[22px]">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />

            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!busy) void handleFile(event.dataTransfer.files?.[0]);
              }}
              className={cn(
                'flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors sm:px-5 sm:py-8',
                busy ? 'cursor-default' : 'cursor-pointer',
                dragging ? 'border-brand bg-[#f0fdf4]' : 'border-[#c8c8c6] bg-[#f9f9f7]',
              )}
            >
              {busy ? (
                <>
                  <Loader2 size={36} className="animate-spin text-brand" />
                  <span className="m-0 text-[13px] font-bold text-[#111827]">
                    Parsing PDF &amp; building labels…
                  </span>
                  <span className="m-0 font-mono text-[11px] text-[#9ca3af]">
                    {phase.kind === 'parsing' && phase.total > 0
                      ? `Page ${phase.page} of ${phase.total}`
                      : 'Reading the document…'}
                  </span>
                </>
              ) : (
                <>
                  <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border border-[#e0e0de] bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.06)] sm:h-[60px] sm:w-[60px]">
                    <Upload size={24} className="text-brand" />
                  </span>
                  <span className="block">
                    <span className="font-display mb-[3px] block text-[14px] font-extrabold text-[#111827] sm:text-[15px]">
                      {dragging ? 'Release to upload' : 'Drop your Amazon PDF here'}
                    </span>
                    <span className="hidden text-[12px] text-[#9ca3af] sm:block">
                      or click to browse files
                    </span>
                  </span>
                  <span className="w-full rounded-[10px] bg-brand px-8 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] sm:w-auto sm:text-[14px]">
                    Upload PDF
                  </span>
                </>
              )}
            </button>

            {busy ? (
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  setPhase({ kind: 'idle' });
                }}
                className="mt-3 w-full cursor-pointer rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] py-2 text-[12.5px] font-semibold text-[#6b7280] hover:text-ink"
              >
                Cancel
              </button>
            ) : null}

            {phase.kind === 'error' ? (
              <ErrorBox error={phase.error} onRetry={() => setPhase({ kind: 'idle' })} />
            ) : null}
          </div>
        </div>

        <p className="mt-3 mb-0 text-center text-[11px] text-[#9ca3af]">
          Parsed on this device — no customer address is uploaded.
        </p>
      </div>
    </section>
  );
}

function ErrorBox({ error, onRetry }: { error: PdfError; onRetry: () => void }) {
  const { title, message, hints, code } = error.detail;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border-[1.5px] border-bad-line">
      <div className="flex items-center gap-2 bg-bad-bg px-3.5 py-2.5">
        <AlertCircle size={15} className="shrink-0 text-bad-icon" />
        <span className="font-display text-[13px] font-bold text-bad-fg">{title}</span>
        <span className="flex-1" />
        <span className="shrink-0 font-mono text-[9.5px] text-bad-icon">{code}</span>
      </div>

      <div className="bg-surface px-3.5 py-3">
        <p className="m-0 text-[12px] leading-relaxed text-[#374151]">{message}</p>

        {hints.length > 0 ? (
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
            {hints.map((hint) => (
              <li key={hint} className="flex gap-2 text-[11.5px] leading-[1.5] text-[#6b7280]">
                <span className="text-bad-icon">·</span>
                <span>{hint}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {error.diagnostic ? (
          <p className="mt-2 mb-0 break-words font-mono text-[10px] leading-snug text-[#9ca3af]">
            {error.diagnostic}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onRetry}
          className="mt-3 w-full cursor-pointer rounded-[10px] border-0 bg-brand py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:bg-brand-hover"
        >
          Try another file
        </button>
      </div>
    </div>
  );
}
