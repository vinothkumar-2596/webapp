import { useCallback, useRef, useState } from 'react';
import { Upload, AlertCircle, Loader2 } from 'lucide-react';
import { useStore } from '../app/store';
import { Button, Card, cn } from '../components/ui';
import { PdfError, toPdfError } from '../lib/pdf/errors';
import { nextSequence } from '../lib/storage';

/**
 * Upload limits, mirrored from lib/pdf/extractText.ts.
 *
 * Duplicated deliberately: importing them would pull the whole pdf.js engine
 * into the initial bundle, which is exactly what the dynamic import below
 * avoids. The parser enforces the real limits — these are for display only.
 */
const MAX_MB = 50;
const MAX_PAGES = 200;

type Phase =
  | { kind: 'idle' }
  | { kind: 'parsing'; page: number; total: number; fileName: string }
  | { kind: 'error'; error: PdfError };

const STEPS = [
  'Upload the Amazon packing-slip PDF',
  'Addresses and order details are extracted',
  'One QR label is generated per page',
  'Review flagged labels, then print the sheet',
];

export function ImportScreen() {
  const { dispatch, settings } = useStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      // Cheap client-side guards before touching the PDF engine.
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
        // pdf.js (~1.9 MB) is loaded only when a file is actually selected,
        // keeping it out of the initial page load.
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

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-4.5">
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.3px]">New import</h1>
        <p className="mt-1.5 text-[13px] text-ink-4">
          Upload an Amazon packing-slip PDF. One page produces one QR shipping label.
        </p>
      </div>

      <Card>
        {/* Step strip */}
        <div className="grid grid-cols-2 border-b border-line bg-surface-muted lg:grid-cols-4">
          {STEPS.map((text, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 border-b border-r border-line px-4 py-3 last:border-r-0 lg:border-b-0"
            >
              <span className="mt-px flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-line-soft font-mono text-[11px] font-semibold text-ink-4">
                {i + 1}
              </span>
              <span className="text-[12px] leading-snug text-ink-2">{text}</span>
            </div>
          ))}
        </div>

        <div className="p-5">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />

          {phase.kind === 'idle' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void handleFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                'rounded-lg border border-dashed px-6 py-9 text-center transition-colors',
                dragging ? 'border-brand bg-ok-bg' : 'border-[#c6cdd6] bg-surface-muted',
              )}
            >
              <div className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-[9px] border border-line bg-surface">
                <Upload size={20} className="text-brand" />
              </div>
              <div className="text-[14px] font-semibold">Drop PDF here or browse</div>
              <div className="mt-1.5 text-[12.5px] text-ink-4">
                Single file · PDF only · up to {MAX_MB} MB · max{' '}
                {MAX_PAGES} pages
              </div>
              <div className="mt-4.5 flex justify-center gap-2">
                <Button variant="primary" onClick={() => inputRef.current?.click()}>
                  Select file
                </Button>
              </div>
            </div>
          ) : null}

          {phase.kind === 'parsing' ? (
            <div className="rounded-lg border border-line p-5">
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="shrink-0 animate-spin text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">
                    Parsing {phase.fileName}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-4">
                    {phase.total > 0
                      ? `Extracting recipient blocks — page ${phase.page} of ${phase.total}`
                      : 'Opening document…'}
                  </div>
                </div>
                <Button
                  onClick={() => {
                    abortRef.current?.abort();
                    setPhase({ kind: 'idle' });
                  }}
                >
                  Cancel
                </Button>
              </div>
              <div className="mt-4 h-[5px] overflow-hidden rounded-[3px] bg-line-soft">
                <div
                  className="h-full rounded-[3px] bg-brand transition-[width] duration-200"
                  style={{
                    width:
                      phase.total > 0 ? `${(phase.page / phase.total) * 100}%` : '30%',
                    animation: phase.total === 0 ? 'bar 1.3s ease-in-out infinite' : undefined,
                  }}
                />
              </div>
            </div>
          ) : null}

          {phase.kind === 'error' ? <ErrorPanel error={phase.error} onRetry={() => setPhase({ kind: 'idle' })} /> : null}
        </div>
      </Card>

      <p className="mt-3.5 text-[11.5px] leading-relaxed text-ink-5">
        Files are parsed in the browser. No customer address ever leaves this device.
      </p>
    </div>
  );
}

/**
 * Error panel.
 *
 * v1 showed a red box that, for the most common failure (selecting a
 * non-PDF), rendered with no text at all. Every error here carries a
 * headline, an explanation, a stable code, and concrete next steps.
 */
function ErrorPanel({ error, onRetry }: { error: PdfError; onRetry: () => void }) {
  const { title, message, hints, code } = error.detail;

  return (
    <div className="overflow-hidden rounded-lg border border-bad-line">
      <div className="flex items-center gap-2.5 border-b border-bad-line bg-bad-bg px-4 py-3">
        <AlertCircle size={16} className="shrink-0 text-bad-icon" />
        <span className="text-[13px] font-semibold text-bad-fg">Import failed — {title}</span>
        <span className="flex-1" />
        <span className="shrink-0 rounded border border-bad-line bg-surface px-1.5 font-mono text-[11px] text-bad-fg max-sm:hidden">
          {code}
        </span>
      </div>
      <div className="bg-surface px-4 pb-4.5 pt-4">
        <p className="m-0 max-w-[520px] text-[12.5px] leading-relaxed text-ink-2">{message}</p>
        <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
          {hints.map((h) => (
            <li key={h} className="text-[12px] leading-relaxed text-ink-4">
              · {h}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={onRetry}>
            Try another file
          </Button>
        </div>
      </div>
    </div>
  );
}
