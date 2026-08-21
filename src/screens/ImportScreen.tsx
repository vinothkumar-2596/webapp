import { useCallback, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useStore } from '../app/store';
import { cn } from '../components/ui';
import { PdfError, toPdfError } from '../lib/pdf/errors';
import { MAX_FILE_BYTES, MAX_PAGES } from '../lib/pdf/extractText';
import { nextSequence } from '../lib/storage';

/**
 * New import — "Scan Option C", web size.
 *
 * Editorial two-column layout: the instruction sits left, the drop target
 * right. The panel keeps a 2px hard border and a ruled background so it reads
 * as a physical document tray rather than a generic dashed dropzone.
 *
 * The limits printed in the meta strip are derived from the real parser
 * constants, not the design's placeholder text — a label that promises
 * "MAX 25 MB" while the code accepts 50 would be a lie in the UI.
 */

const MAX_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

const FACTS = [
  'Recipient address and order number read automatically.',
  'One QR label per page, laid out on A4.',
  'Everything is parsed on your device — nothing is uploaded.',
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

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="mx-auto flex min-h-full w-full max-w-[1180px] flex-col px-5 py-8 sm:px-8 lg:py-12">
      <div className="flex flex-1 flex-col items-start gap-9 lg:flex-row lg:items-center lg:gap-16">
        {/* Left — instruction */}
        <div className="min-w-0 lg:flex-[0_0_38%]">
          <h1 className="m-0 text-[40px] leading-[0.97] font-black tracking-[-1.4px] uppercase sm:text-[52px] lg:text-[58px]">
            Upload the
            <br />
            packing slip
          </h1>

          <div className="mt-4 flex items-center gap-[9px]">
            <span className="h-0.5 w-[26px] flex-none bg-brand" />
            <span className="text-[13.5px] text-ink-3 sm:text-[14px]">
              one PDF page → one QR label
            </span>
          </div>

          <div className="mt-6 hidden max-w-[340px] border-t border-line lg:block">
            {FACTS.map((text, i) => (
              <div key={text} className="flex gap-3 border-b border-line py-[11px]">
                <span className="flex-none font-mono text-[10.5px] text-brand">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] leading-[1.45] text-ink-3">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — drop target / progress / error */}
        <div className="flex w-full min-w-0 flex-col lg:flex-1">
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
              onDrop={onDrop}
              className={cn(
                'relative flex min-h-[340px] w-full cursor-pointer flex-col overflow-hidden rounded border-2 border-ink bg-surface p-0 text-left transition-colors',
                dragging ? 'bg-surface-sunken' : 'hover:bg-[#fcfdfd]',
              )}
            >
              {/* ruled paper */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: 'linear-gradient(#F1F4F7 1px, transparent 1px)',
                  backgroundSize: '100% 34px',
                }}
              />
              <span
                aria-hidden="true"
                className="absolute top-[7px] left-[7px] h-[9px] w-[9px] border-t-[1.5px] border-l-[1.5px] border-[#c3cad3]"
              />
              <span
                aria-hidden="true"
                className="absolute top-[7px] right-[7px] h-[9px] w-[9px] border-t-[1.5px] border-r-[1.5px] border-[#c3cad3]"
              />

              <span className="relative flex w-full flex-1 flex-col items-center justify-center gap-4 px-6 py-7">
                <span className="flex flex-col items-center gap-[9px]">
                  <span className="block motion-safe:animate-[float_2.8s_ease-in-out_infinite]">
                    <PdfSheet />
                  </span>
                  <span className="block h-[5px] w-11 rounded-[50%] bg-ink/15 blur-[1.5px] motion-safe:animate-[shade_2.8s_ease-in-out_infinite]" />
                </span>
                <span className="text-center">
                  <span className="block text-[19px] font-bold tracking-[-0.4px]">
                    {dragging ? 'Release to read it' : 'Drop your PDF here'}
                  </span>
                  <span className="mt-[5px] block text-[13.5px] text-ink-4">
                    or drop it anywhere on this panel
                  </span>
                </span>
              </span>

              <span className="relative flex w-full border-t-2 border-ink bg-surface font-mono text-[10.5px] text-ink-3">
                <span className="flex-1 border-r border-line px-2 py-[11px] text-center">
                  MAX {MAX_MB} MB
                </span>
                <span className="flex-1 border-r border-line px-2 py-[11px] text-center">
                  {MAX_PAGES} PAGES
                </span>
                <span className="flex-1 px-2 py-[11px] text-center">
                  {settings.paperSize} · {settings.labelsPerRow}-UP
                </span>
              </span>
            </button>
          ) : null}

          {phase.kind === 'parsing' ? (
            <ParsingPanel
              phase={phase}
              onCancel={() => {
                abortRef.current?.abort();
                setPhase({ kind: 'idle' });
              }}
            />
          ) : null}

          {phase.kind === 'error' ? (
            <ErrorPanel error={phase.error} onRetry={() => setPhase({ kind: 'idle' })} />
          ) : null}

          <div className="pt-4">
            {phase.kind === 'idle' ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex h-[58px] w-full cursor-pointer items-center justify-center gap-2.5 rounded border-0 bg-brand text-[14.5px] font-bold tracking-[0.1em] text-white uppercase transition-colors hover:bg-brand-hover"
              >
                Scanner un PDF Amazon
                <ArrowRight size={17} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Stylised PDF sheet — matches the design's floating document mark. */
function PdfSheet() {
  return (
    <svg width="62" height="76" viewBox="0 0 62 76" fill="none" aria-hidden="true">
      <path d="M2 4a2 2 0 0 1 2-2h34l22 22v48a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" fill="#0B7A5B" />
      <path d="M38 2l22 22H40a2 2 0 0 1-2-2Z" fill="#0A6A4F" />
      <text
        x="20"
        y="56"
        fill="#ffffff"
        fontFamily="Roboto, sans-serif"
        fontSize="15"
        fontWeight="700"
      >
        PDF
      </text>
    </svg>
  );
}

function ParsingPanel({
  phase,
  onCancel,
}: {
  phase: { page: number; total: number; fileName: string };
  onCancel: () => void;
}) {
  const total = phase.total || 0;
  const blocks = total > 0 ? Math.min(total, 12) : 8;
  const filled = total > 0 ? Math.round((phase.page / total) * blocks) : 0;

  return (
    <div className="relative flex min-h-[340px] w-full flex-col overflow-hidden rounded border-2 border-ink bg-surface">
      <span
        aria-hidden="true"
        className="absolute right-0 left-0 h-0.5 bg-[linear-gradient(90deg,transparent,#0B7A5B,transparent)] motion-safe:animate-[scan_1.6s_linear_infinite]"
      />

      <div className="relative flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-7">
        <span className="font-mono text-[44px] leading-none font-medium tracking-[-2px] tabular-nums">
          {String(phase.page).padStart(2, '0')}
          <span className="text-[#b9c0c9]">/{total > 0 ? String(total).padStart(2, '0') : '--'}</span>
        </span>
        <span className="text-[14px] font-medium text-ink-3 motion-safe:animate-pulse">
          Reading packing slips…
        </span>
        <span className="max-w-full truncate px-4 font-mono text-[10.5px] text-ink-5">
          {phase.fileName}
        </span>
        <span className="mt-1 flex gap-1">
          {Array.from({ length: blocks }, (_, i) => (
            <span
              key={i}
              className={cn('h-2 w-4 transition-colors', i < filled ? 'bg-brand' : 'bg-line')}
            />
          ))}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 flex cursor-pointer items-center gap-1.5 border-0 bg-transparent font-mono text-[10.5px] tracking-[0.06em] text-ink-4 uppercase hover:text-ink"
        >
          <X size={12} />
          Cancel
        </button>
      </div>

      <div className="border-t-2 border-ink px-3.5 py-[11px] text-center font-mono text-[10.5px] text-ink-3">
        PARSED ON DEVICE · NOTHING UPLOADED
      </div>
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: PdfError; onRetry: () => void }) {
  const { title, message, hints, code } = error.detail;

  return (
    <div className="flex min-h-[340px] w-full flex-col overflow-hidden rounded border-2 border-bad-icon bg-surface">
      <div className="flex items-center gap-2.5 border-b-2 border-bad-icon bg-bad-bg px-4 py-3.5">
        <span className="text-[13.5px] font-bold text-bad-fg">{title}</span>
        <span className="flex-1" />
        <span className="flex-none border-[1.5px] border-bad-icon px-[7px] py-[3px] font-mono text-[10px] tracking-[0.06em] text-bad-icon">
          {code}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-4 py-4">
        <p className="m-0 max-w-[520px] text-[13.5px] leading-relaxed text-ink-3">{message}</p>

        <div className="mt-3.5 border-t border-line">
          {hints.map((hint) => (
            <div key={hint} className="flex gap-3 border-b border-line py-2.5">
              <span className="flex-none font-mono text-[10.5px] text-bad-icon">·</span>
              <span className="text-[12.5px] leading-[1.45] text-ink-4">{hint}</span>
            </div>
          ))}
        </div>

        {error.diagnostic ? (
          <p className="mt-3 mb-0 max-w-full break-words font-mono text-[10.5px] leading-snug text-ink-6">
            {error.diagnostic}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="h-[52px] w-full cursor-pointer border-0 border-t-2 border-ink bg-ink text-[13px] font-bold tracking-[0.1em] text-white uppercase hover:bg-[#1b222b]"
      >
        Try another file
      </button>
    </div>
  );
}
