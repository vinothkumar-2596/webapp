import { useState } from 'react';
import { Printer, Trash2, Pencil, FileText, Upload, Layers, Plus, RefreshCw } from 'lucide-react';
import { useStore } from '../app/store';
import { Button, Card, EmptyState } from '../components/ui';
import { ShipLabel } from '../components/ShipLabel';
import { PrintSheet } from '../components/PrintSheet';
import { EditLabelDialog } from '../components/EditLabelDialog';
import { createManualLabel } from '../lib/pdf/parseSlip';
import type { Label } from '../lib/types';

/**
 * The one and only working screen after an import: the label sheet.
 *
 * Each card carries its own Edit and Delete controls (screen-only — they are
 * never printed and never reach the Word file). The top bar downloads the
 * fixed-layout Word document or prints. Nothing else.
 */
export function BatchScreen() {
  const { activeBatch, batches, settings, dispatch, navigate } = useStore();
  const [editing, setEditing] = useState<Label | null>(null);
  const [exporting, setExporting] = useState(false);

  if (batches.length === 0 || !activeBatch) {
    return (
      <Card className="mx-auto max-w-[760px]">
        <EmptyState
          icon={<Layers size={28} />}
          title="No labels yet"
          body="Upload an Amazon packing-slip PDF to generate your QR shipping labels."
          action={
            <Button variant="primary" icon={<Upload size={14} />} onClick={() => navigate('import')}>
              Upload PDF
            </Button>
          }
        />
      </Card>
    );
  }

  const batchId = activeBatch.id;
  const labels = activeBatch.labels;

  const handlePrint = () => {
    if (labels.length === 0) return;
    dispatch({ type: 'markPrinted', batchId });
    // Let the portal flush before the print dialog opens.
    requestAnimationFrame(() => window.print());
  };

  // docx + qrcode are heavy and only needed here, so load them on demand.
  const handleWord = async () => {
    if (labels.length === 0 || exporting) return;
    setExporting(true);
    try {
      const { downloadLabelsDocx } = await import('../lib/word/exportDocx');
      await downloadLabelsDocx(activeBatch);
    } catch (err) {
      console.error('Word export failed', err);
      window.alert('Sorry — the Word file could not be generated.');
    } finally {
      setExporting(false);
    }
  };

  // Mirror the Word output on screen: group into A4 sheets of 10 (2×5), in page
  // order, so the preview matches the downloaded file 1:1.
  const PER_PAGE = 10;
  const ordered = [...labels].sort((a, b) => a.pageNumber - b.pageNumber);
  const pages: Label[][] = [];
  for (let i = 0; i < ordered.length; i += PER_PAGE) pages.push(ordered.slice(i, i + PER_PAGE));
  if (pages.length === 0) pages.push([]);

  return (
    <div className="mx-auto max-w-[900px]">
      {/* Off-screen print sheet — every label, clean (no edit/delete icons). */}
      <PrintSheet labels={labels} settings={settings} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[18px] font-bold">{labels.length} labels</h1>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-4">{activeBatch.fileName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<Upload size={14} />} onClick={() => navigate('import')}>
            New PDF
          </Button>
          <Button
            variant="secondary"
            aria-label="Refresh page"
            title="Refresh page"
            icon={<RefreshCw size={14} />}
            className="w-8 justify-center px-0"
            onClick={() => window.location.reload()}
          />
          <Button
            aria-label="Add a blank label"
            title="Add a blank label"
            icon={<Plus size={15} />}
            className="w-8 justify-center px-0"
            onClick={() => {
              const label = createManualLabel(activeBatch.pageCount + 1);
              dispatch({ type: 'addLabel', batchId, label });
              setEditing(label);
            }}
          />
          <Button
            icon={<FileText size={14} />}
            disabled={labels.length === 0 || exporting}
            onClick={handleWord}
            title="Download an editable Word file — A4, 10 labels per page"
          >
            {exporting ? 'Preparing…' : 'Word'}
          </Button>
          <Button
            variant="primary"
            icon={<Printer size={14} />}
            disabled={labels.length === 0}
            onClick={handlePrint}
          >
            Print
          </Button>
        </div>
      </div>

      {labels.length === 0 ? (
        <EmptyState
          title="No labels in this batch"
          body="Every label was deleted. Upload a new PDF to start again."
        />
      ) : (
        <div className="flex flex-col items-center gap-7">
          {pages.map((pageLabels, pageIdx) => (
            <div key={pageIdx} className="w-full">
              <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-5">
                A4 page {pageIdx + 1} of {pages.length}
              </div>
              {/* An A4-proportioned sheet: a fixed 2×5 grid of 10 cells. */}
              <div className="mx-auto grid aspect-[210/297] w-full max-w-[760px] grid-cols-2 grid-rows-5 gap-[2%] rounded-md border border-line bg-white p-[2%] shadow-[0_2px_12px_rgba(16,24,40,0.12)]">
                {Array.from({ length: PER_PAGE }).map((_, cellIdx) => {
                  const label = pageLabels[cellIdx];
                  if (!label) {
                    // Fixed empty cell — keeps the 2×5 grid even when a page
                    // isn't full (e.g. 1 label → 9 empty cells).
                    return (
                      <div
                        key={cellIdx}
                        aria-hidden
                        className="rounded-sm border border-dashed border-line-soft"
                      />
                    );
                  }
                  return (
                    <div
                      key={label.id}
                      className="relative overflow-hidden rounded-sm border border-line-print"
                    >
                      <ShipLabel label={label} bare />
                      <div className="no-print absolute bottom-1.5 right-1.5 flex gap-1">
                        <button
                          type="button"
                          aria-label="Edit label"
                          title="Edit"
                          onClick={() => setEditing(label)}
                          className="cursor-pointer rounded-md border border-line bg-surface/95 p-1 text-ink-3 shadow-sm hover:text-brand"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete label"
                          title="Delete"
                          onClick={() =>
                            dispatch({ type: 'deleteLabel', batchId, labelId: label.id })
                          }
                          className="cursor-pointer rounded-md border border-bad-line bg-surface/95 p-1 text-bad-fg shadow-sm hover:bg-bad-bg"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <EditLabelDialog
        label={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={(p) =>
          editing && dispatch({ type: 'patchLabel', batchId, labelId: editing.id, patch: p })
        }
      />
    </div>
  );
}
