import { useCallback, useRef, useState } from 'react';
import { AlertCircle, CloudUpload, FileText, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { useStore } from '../app/store';
import { cn } from '../components/ui';
import { PdfError, toPdfError } from '../lib/pdf/errors';
import { nextSequence } from '../lib/storage';
import { isInstalledApp } from '../lib/installWindow';

/**
 * Upload screen.
 *
 * A single, focused card: a titled header strip, a large dashed drop zone
 * with the emerald call to action, and an on-device privacy note.
 *
 * The parsing underneath is unchanged — typed errors, cancellation and the
 * iOS fixes all stay.
 */

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
      <div className="w-full max-w-[500px]">
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.03),0_10px_28px_-18px_rgba(16,24,40,0.15)]">
          {/* Card header */}
          <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-surface-muted px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ok-bg text-brand">
                <FileText size={16} />
              </span>
              <span className="font-display truncate text-[14px] font-semibold text-ink sm:text-[15px]">
                Upload Amazon Packing Slip PDF
              </span>
            </div>
            <span className="shrink-0 rounded-md border border-line bg-surface px-2.5 py-1 text-[10px] font-semibold tracking-wide text-ink-4">
              Vape de France
            </span>
          </div>

          {/* Drop zone */}
          <div className="p-4 sm:p-6">
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
                'group flex w-full flex-col items-center gap-3.5 rounded-md border-2 border-dashed px-5 py-10 text-center transition-colors sm:py-12',
                busy ? 'cursor-default' : 'cursor-pointer',
                dragging
                  ? 'border-brand bg-ok-bg'
                  : 'border-line bg-surface-muted hover:border-brand hover:bg-ok-bg',
              )}
            >
              {busy ? (
                <>
                  <Loader2 size={30} className="animate-spin text-brand" />
                  <span className="font-display text-[15px] font-semibold text-ink">
                    Parsing PDF &amp; building labels…
                  </span>
                  <span className="font-mono text-[11px] text-ink-5">
                    {phase.kind === 'parsing' && phase.total > 0
                      ? `Page ${phase.page} of ${phase.total}`
                      : 'Reading the document…'}
                  </span>
                </>
              ) : (
                <>
                  <CloudUpload size={30} className="text-brand" />
                  <span className="block">
                    <span className="font-display block text-[15.5px] font-semibold text-ink">
                      {dragging ? 'Release to upload' : 'Drop your Amazon PDF here'}
                    </span>
                    <span className="mt-1 block text-[12.5px] text-ink-5">or click to browse</span>
                  </span>
                  <span className="mt-0.5 inline-flex items-center justify-center gap-2 rounded-md bg-brand px-6 py-2.5 text-[13.5px] font-semibold text-white transition-colors group-hover:bg-brand-hover">
                    <Upload size={15} />
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
                className="mt-3 w-full cursor-pointer rounded-md border border-line bg-surface-muted py-2 text-[12.5px] font-semibold text-ink-4 transition-colors hover:text-ink"
              >
                Cancel
              </button>
            ) : null}

            {phase.kind === 'error' ? (
              <ErrorBox error={phase.error} onRetry={() => setPhase({ kind: 'idle' })} />
            ) : null}
          </div>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-5">
          <ShieldCheck size={13} className="shrink-0" />
          Parsed on this device — no customer address is uploaded.
        </p>
      </div>
    </section>
  );
}

function ErrorBox({ error, onRetry }: { error: PdfError; onRetry: () => void }) {
  const { title, message, hints, code } = error.detail;

  return (
    <div className="mt-3 overflow-hidden rounded-md border-[1.5px] border-bad-line">
      <div className="flex items-center gap-2 bg-bad-bg px-3.5 py-2.5">
        <AlertCircle size={15} className="shrink-0 text-bad-icon" />
        <span className="font-display text-[13px] font-bold text-bad-fg">{title}</span>
        <span className="flex-1" />
        <span className="shrink-0 font-mono text-[9.5px] text-bad-icon">{code}</span>
      </div>

      <div className="bg-surface px-3.5 py-3">
        <p className="m-0 text-[12px] leading-relaxed text-ink-2">{message}</p>

        {hints.length > 0 ? (
          <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
            {hints.map((hint) => (
              <li key={hint} className="flex gap-2 text-[11.5px] leading-[1.5] text-ink-4">
                <span className="text-bad-icon">·</span>
                <span>{hint}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {error.diagnostic ? (
          <p className="mt-2 mb-0 break-words font-mono text-[10px] leading-snug text-ink-5">
            {error.diagnostic}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onRetry}
          className="mt-3 w-full cursor-pointer rounded-md border-0 bg-brand py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] hover:bg-brand-hover"
        >
          Try another file
        </button>
      </div>
    </div>
  );
}
