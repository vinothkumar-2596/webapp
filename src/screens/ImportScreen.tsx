import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Loader2, Upload, X } from 'lucide-react';
import { useStore } from '../app/store';
import { Button, cn } from '../components/ui';
import { PdfError, toPdfError } from '../lib/pdf/errors';
import { nextSequence } from '../lib/storage';

const MAX_MB = 50;
const MAX_PAGES = 200;

type Phase =
  | { kind: 'idle' }
  | { kind: 'parsing'; page: number; total: number; fileName: string }
  | { kind: 'error'; error: PdfError };

const STEPS = ['Upload PDF', 'Read addresses', 'Generate labels', 'Print & scan'];

export function ImportScreen() {
  const { dispatch, settings } = useStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      const looksPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
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

  const currentStep =
    phase.kind === 'parsing' && phase.total > 0 && phase.page >= phase.total ? 2 : phase.kind === 'parsing' ? 1 : 0;

  return (
    <section className="flex min-h-[calc(100dvh-56px)] items-center justify-center px-4 py-10 sm:px-5 sm:py-14">
      <div className="w-full max-w-[660px]">
        <div className="text-center">
          <div className="inline-flex h-[26px] items-center gap-2 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-ink-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <span className="h-[5px] w-[5px] rounded-full bg-brand-pulse" />
            Runs locally · nothing uploaded
          </div>
          <h1 className="m-0 mt-5 text-[32px] font-bold leading-[1.08] text-ink sm:text-[40px]">
            Scan a packing slip.
            <span className="mt-0.5 block text-brand">Get your labels.</span>
          </h1>
          <p className="mx-auto mb-0 mt-3 max-w-[468px] text-[14px] leading-relaxed text-ink-4 sm:text-[14.5px]">
            One Amazon PDF in, one QR shipping label per page out — ready for the printer.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />

        {phase.kind === 'idle' ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              'mt-7 block w-full cursor-pointer rounded-[14px] border bg-surface px-6 py-9 text-center font-sans shadow-[0_1px_1px_rgba(16,24,40,0.03),0_8px_22px_-14px_rgba(16,24,40,0.18)] transition-[border-color,box-shadow,transform]',
              'hover:border-brand hover:shadow-[0_1px_1px_rgba(16,24,40,0.04),0_12px_26px_-14px_rgba(11,122,91,0.3)] active:translate-y-px sm:px-7 sm:py-10',
              dragging ? 'border-brand bg-ok-bg' : 'border-[#e4e7ec]',
            )}
          >
            <span className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-[13px] bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_4px_rgba(16,24,40,0.14)]">
              <Upload size={23} strokeWidth={1.9} />
            </span>
            <span className="mt-4 block text-[18px] font-bold text-ink sm:text-[20px]">
              Scan an Amazon PDF
            </span>
            <span className="mt-1.5 block text-[13.5px] text-ink-4">
              Click to browse, or drop the file anywhere here
            </span>
            <span className="mx-auto mt-4 block w-fit min-w-[230px] border-t border-line-soft pt-4 font-mono text-[11px] text-ink-5">
              PDF · max {MAX_MB} MB · {MAX_PAGES} pages
            </span>
          </button>
        ) : null}

        {phase.kind === 'parsing' ? (
          <div className="mt-7 rounded-[14px] border border-[#e4e7ec] bg-surface px-6 py-9 text-center shadow-[0_1px_1px_rgba(16,24,40,0.03),0_8px_22px_-14px_rgba(16,24,40,0.18)] sm:px-7 sm:py-10">
            <Loader2 size={28} className="mx-auto animate-spin text-brand" />
            <div className="mt-4 truncate text-[17px] font-bold">Reading {phase.fileName}</div>
            <div className="mt-1.5 text-[13.5px] text-ink-4">
              {phase.total > 0
                ? `Extracting page ${phase.page} of ${phase.total}`
                : 'Opening document…'}
            </div>
            <div className="mx-auto mt-5 h-[5px] max-w-[280px] overflow-hidden rounded-[3px] bg-line-soft">
              <div
                className="h-full rounded-[3px] bg-brand transition-[width] duration-200"
                style={{
                  width: phase.total > 0 ? `${(phase.page / phase.total) * 100}%` : '30%',
                  animation: phase.total === 0 ? 'bar 1.3s ease-in-out infinite' : undefined,
                }}
              />
            </div>
            <Button
              className="mt-5"
              icon={<X size={13} />}
              onClick={() => {
                abortRef.current?.abort();
                setPhase({ kind: 'idle' });
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}

        {phase.kind === 'error' ? (
          <ErrorPanel error={phase.error} onRetry={() => setPhase({ kind: 'idle' })} />
        ) : null}

        <ProgressStrip current={currentStep} />

        <p className="mb-0 mt-5 text-center text-[11.5px] text-ink-6">
          Parsed on this device — no customer address is uploaded.
        </p>
      </div>
    </section>
  );
}

function ProgressStrip({ current }: { current: number }) {
  return (
    <ol className="process-strip" aria-label="Label creation progress">
      {STEPS.map((label, index) => {
        const state = index === current ? 'active' : index < current ? 'done' : 'pending';
        return (
          <li key={label} className="process-step" data-state={state}>
            <span className="process-step__number">0{index + 1}</span>
            <span className="process-step__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ErrorPanel({ error, onRetry }: { error: PdfError; onRetry: () => void }) {
  const { title, message, hints, code } = error.detail;

  return (
    <div className="mt-7 rounded-[14px] border border-bad-line bg-surface px-6 py-8 text-center shadow-[0_1px_1px_rgba(16,24,40,0.03),0_8px_22px_-14px_rgba(180,35,24,0.18)] sm:px-7">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-bad-bg text-bad-icon">
        <AlertCircle size={21} />
      </span>
      <div className="mt-3.5 text-[17px] font-bold">{title}</div>
      <p className="mx-auto mb-0 mt-2 max-w-[430px] text-[13.5px] leading-relaxed text-ink-4">
        {message}
      </p>
      {hints.length > 0 ? (
        <p className="mx-auto mb-0 mt-2 max-w-[430px] text-[11.5px] leading-relaxed text-ink-5">
          {hints[0]}
        </p>
      ) : null}
      <div className="mt-2 font-mono text-[10.5px] text-ink-6">{code}</div>
      {error.diagnostic ? (
        <p className="mx-auto mb-0 mt-1.5 max-w-[430px] break-words font-mono text-[10.5px] leading-snug text-ink-6">
          {error.diagnostic}
        </p>
      ) : null}
      <Button variant="primary" className="mt-4 h-9 px-4" onClick={onRetry}>
        Try another file
      </Button>
    </div>
  );
}
