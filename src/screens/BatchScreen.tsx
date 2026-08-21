import { useMemo, useState } from 'react';
import {
  Printer,
  Plus,
  Trash2,
  Pencil,
  ShieldCheck,
  Layers,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { useStore } from '../app/store';
import { Badge, Button, Card, EmptyState, cn } from '../components/ui';
import { ShipLabel } from '../components/ShipLabel';
import { PrintSheet } from '../components/PrintSheet';
import { EditLabelDialog } from '../components/EditLabelDialog';
import { createManualLabel } from '../lib/pdf/parseSlip';
import {
  destinationOf,
  isBlocked,
  needsReview,
  printableLabels,
  statsFor,
  REVIEW_REASON_TEXT,
  type Label,
} from '../lib/types';

type Tab = 'orders' | 'sheet';

export function BatchScreen() {
  const { activeBatch, activeLabel, batches, settings, search, dispatch, navigate } = useStore();
  const [tab, setTab] = useState<Tab>('sheet');
  const [editing, setEditing] = useState<Label | null>(null);

  const filtered = useMemo(() => {
    if (!activeBatch) return [];
    const q = search.trim().toLowerCase();
    if (!q) return activeBatch.labels;
    return activeBatch.labels.filter((l) => {
      const hay = [
        l.recipientName.value,
        l.orderNumber.value,
        l.address.city,
        l.address.postalCode,
        ...l.address.lines,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeBatch, search]);

  const stats = useMemo(
    () => statsFor(activeBatch?.labels ?? []),
    [activeBatch],
  );

  const toPrint = useMemo(
    () => printableLabels(activeBatch?.labels ?? [], settings.requireVerification),
    [activeBatch, settings.requireVerification],
  );

  const blockedSelected = useMemo(
    () => (activeBatch?.labels ?? []).filter((l) => l.selected && isBlocked(l)).length,
    [activeBatch],
  );

  if (batches.length === 0) {
    return (
      <Card className="mx-auto max-w-[760px]">
        <EmptyState
          icon={<Layers size={28} />}
          title="No batches yet"
          body="Import an Amazon packing-slip PDF to generate your first set of QR shipping labels."
          action={
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => navigate('import')}>
              New import
            </Button>
          }
        />
      </Card>
    );
  }

  if (!activeBatch) return null;

  const batchId = activeBatch.id;

  const patch = (labelId: string, p: Partial<Label>) =>
    dispatch({ type: 'patchLabel', batchId, labelId, patch: p });

  const handlePrint = () => {
    if (toPrint.length === 0) return;
    dispatch({ type: 'markPrinted', batchId });
    // Let the portal flush before the print dialog opens.
    requestAnimationFrame(() => window.print());
  };

  const allShownSelected = filtered.length > 0 && filtered.every((l) => l.selected);

  return (
    <div className="mx-auto max-w-[1060px]">
      {/* Only the labels that pass verification are rendered into the print root. */}
      <PrintSheet labels={toPrint} settings={settings} batchRef={activeBatch.ref} />

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[18px] font-bold">{stats.total} labels</h1>
            {stats.needsReview > 0 ? (
              <Badge tone="warn">{stats.needsReview} need review</Badge>
            ) : (
              <Badge tone="ok">Ready to print</Badge>
            )}
            {activeBatch.printedAt ? <Badge tone="neutral">Printed</Badge> : null}
          </div>
          <p className="mt-1 truncate text-[12.5px] text-ink-4">
            {activeBatch.fileName} · one label per page · batch {activeBatch.ref}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex h-8 overflow-hidden rounded-md border border-line bg-surface"
            aria-label="Labels per row"
          >
            {([1, 2] as const).map((columns) => (
              <button
                key={columns}
                type="button"
                onClick={() =>
                  dispatch({ type: 'patchSettings', patch: { labelsPerRow: columns } })
                }
                className={cn(
                  'cursor-pointer border-0 px-3 text-[12.5px] font-medium',
                  columns === 1 && 'border-r border-line',
                  settings.labelsPerRow === columns
                    ? 'bg-brand text-white'
                    : 'bg-surface text-ink-2 hover:bg-surface-muted',
                )}
              >
                {columns} col
              </button>
            ))}
          </div>
          <Button
            icon={<Plus size={14} />}
            onClick={() => {
              const label = createManualLabel(activeBatch.pageCount + 1);
              dispatch({ type: 'addLabel', batchId, label });
              setEditing(label);
            }}
          >
            Add label
          </Button>
          <Button
            variant="secondary"
            icon={<Trash2 size={14} />}
            aria-label="Delete batch"
            title="Delete batch"
            className="w-8 justify-center px-0 text-bad-fg"
            onClick={() => {
              if (window.confirm(`Delete batch ${activeBatch.ref} and all its labels?`)) {
                dispatch({ type: 'removeBatch', batchId });
              }
            }}
          />
          <Button
            variant="primary"
            icon={<Printer size={14} />}
            disabled={toPrint.length === 0}
            onClick={handlePrint}
          >
            Print
          </Button>
        </div>
      </div>

      {/* ── Print gate ──────────────────────────────────────────── */}
      {settings.requireVerification && blockedSelected > 0 ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-bg px-4 py-3">
          <AlertTriangle size={16} className="mt-px shrink-0 text-warn-icon" />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[12.5px] font-semibold text-warn-fg">
              {blockedSelected} selected label{blockedSelected === 1 ? '' : 's'} will not be
              printed
            </p>
            <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-warn-fg/90">
              Data could not be read from the PDF for these pages. Open each one, correct it, and
              save — or turn off “Require address verification” in the label template to print
              anyway.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="mb-3.5 flex gap-1">
        {(['orders', 'sheet'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'h-8 cursor-pointer rounded-md border px-3 text-[12.5px]',
              tab === id
                ? 'border-ok-line bg-ok-bg font-semibold text-brand'
                : 'border-transparent bg-transparent font-medium text-ink-4 hover:border-line hover:bg-surface',
            )}
          >
            {id === 'orders' ? 'Review & edit' : 'Label sheet'}
          </button>
        ))}
      </div>

      {tab === 'orders' ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_372px]">
          {/* ── Orders table ──────────────────────────────────── */}
          <Card className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-surface-muted px-4 py-2.5">
              <span className="text-[12.5px] font-medium">
                {stats.selected} of {stats.total} selected
              </span>
              <span className="h-4 w-px bg-line" />
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'setSelection',
                    batchId,
                    labelIds: filtered.map((l) => l.id),
                    selected: !allShownSelected,
                  })
                }
                className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-brand"
              >
                {allShownSelected ? 'Deselect all' : 'Select all'}
              </button>
              {stats.needsReview > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const first = activeBatch.labels.find(needsReview);
                    if (first) {
                      dispatch({ type: 'selectLabel', labelId: first.id });
                      setEditing(first);
                    }
                  }}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-warn-fg"
                >
                  Review {stats.needsReview} flagged
                </button>
              ) : null}
              <span className="flex-1" />
              <label className="flex h-8 min-w-[200px] items-center gap-2 rounded-md border border-line bg-surface px-2.5">
                <Search size={14} className="shrink-0 text-ink-5" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) =>
                    dispatch({ type: 'setSearch', value: event.target.value })
                  }
                  placeholder="Search labels"
                  className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-ink outline-none"
                />
              </label>
              <span className="font-mono text-[11px] text-ink-5">{activeBatch.ref}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse">
                <thead>
                  <tr>
                    <Th className="w-[38px] pl-4 pr-0">
                      <input
                        type="checkbox"
                        aria-label="Select all labels"
                        checked={allShownSelected}
                        onChange={(e) =>
                          dispatch({
                            type: 'setSelection',
                            batchId,
                            labelIds: filtered.map((l) => l.id),
                            selected: e.target.checked,
                          })
                        }
                        className="h-3.5 w-3.5 accent-brand"
                      />
                    </Th>
                    <Th className="pl-0">Recipient</Th>
                    <Th>Destination</Th>
                    <Th>Order ID</Th>
                    <Th className="text-right">Items</Th>
                    <Th>Label</Th>
                    <Th className="w-[70px]" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((label) => {
                    const active = label.id === activeLabel?.id;
                    const flagged = needsReview(label);
                    return (
                      <tr
                        key={label.id}
                        onClick={() => dispatch({ type: 'selectLabel', labelId: label.id })}
                        className={cn(
                          'cursor-pointer border-b border-line-soft',
                          active ? 'bg-[#f4f8f6]' : 'bg-surface hover:bg-surface-muted',
                        )}
                      >
                        <Td className="pl-4 pr-0">
                          <input
                            type="checkbox"
                            aria-label={`Select ${label.recipientName.value ?? 'label'}`}
                            checked={label.selected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              patch(label.id, { selected: e.target.checked })
                            }
                            className="h-3.5 w-3.5 accent-brand"
                          />
                        </Td>
                        <Td className="pl-0 text-[13px] font-medium">
                          {label.recipientName.value ?? (
                            <span className="italic text-bad-fg">Not read</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-[12.5px] text-ink-3">
                          {destinationOf(label)}
                        </Td>
                        <Td className="whitespace-nowrap font-mono text-[12px] text-ink-2">
                          {label.orderNumber.value ?? (
                            <span className="font-sans italic text-bad-fg">Missing</span>
                          )}
                        </Td>
                        <Td className="text-right font-mono text-[12.5px]">
                          {label.product.quantity ?? '—'}
                        </Td>
                        <Td>
                          {flagged ? (
                            <Badge tone="warn">Needs review</Badge>
                          ) : label.reviewed && label.source === 'manual' ? (
                            <Badge tone="ok">Verified</Badge>
                          ) : (
                            <Badge tone="ok">Generated</Badge>
                          )}
                        </Td>
                        <Td>
                          <div className="flex gap-1">
                            <IconButton
                              label="Edit label"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(label);
                              }}
                            >
                              <Pencil size={13} />
                            </IconButton>
                            <IconButton
                              label="Delete label"
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: 'deleteLabel', batchId, labelId: label.id });
                              }}
                            >
                              <Trash2 size={13} />
                            </IconButton>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="No labels match your search"
                body="Clear the search box to see every label in this batch."
              />
            ) : (
              <div className="flex items-center justify-between bg-surface-muted px-4 py-2.5 text-[12px] text-ink-4">
                <span>
                  Showing {filtered.length} of {stats.total} labels
                </span>
                <span>Parser v{activeBatch.labels[0]?.parserVersion ?? '—'}</span>
              </div>
            )}
          </Card>

          {/* ── Preview panel ─────────────────────────────────── */}
          <Card className="min-w-0 xl:sticky xl:top-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="m-0 text-[13px] font-semibold">Label preview</h2>
              <span className="rounded border border-line bg-canvas px-1.5 font-mono text-[11px] text-ink-4">
                {settings.labelsPerRow === 1 ? '1 per row' : '2 per row'}
              </span>
            </div>

            {activeLabel ? (
              <>
                <div className="bg-surface-sunken px-4 py-4.5">
                  <ShipLabel
                    label={activeLabel}
                    settings={settings}
                    batchRef={activeBatch.ref}
                    size="preview"
                  />
                </div>

                {activeLabel.reviewReasons.length > 0 && !activeLabel.reviewed ? (
                  <div className="border-t border-warn-line bg-warn-bg px-4 py-3">
                    <p className="m-0 text-[12px] font-semibold text-warn-fg">Needs attention</p>
                    <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                      {activeLabel.reviewReasons.map((r) => (
                        <li key={r} className="text-[11.5px] leading-snug text-warn-fg">
                          · {REVIEW_REASON_TEXT[r]}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="border-t border-line px-4 py-3.5">
                  <Row label="Source page" value={`${activeLabel.pageNumber} / ${activeBatch.pageCount}`} mono />
                  <Row
                    label="QR payload"
                    value={activeLabel.orderNumber.value ?? 'None — no QR printed'}
                    mono={activeLabel.orderNumber.value !== null}
                  />
                  <Row
                    label="Confidence"
                    value={
                      activeLabel.orderNumber.confidence === 'high'
                        ? 'Verified anchor'
                        : activeLabel.orderNumber.confidence === 'low'
                          ? 'Unanchored — check'
                          : 'Not found'
                    }
                  />
                  <Row label="Origin" value={activeLabel.source === 'parsed' ? 'Parsed from PDF' : 'Entered manually'} />

                  <div className="mt-3.5 flex gap-2">
                    <Button className="flex-1" onClick={() => setEditing(activeLabel)} icon={<Pencil size={13} />}>
                      Edit
                    </Button>
                    {needsReview(activeLabel) ? (
                      <Button
                        className="flex-1"
                        variant="primary"
                        icon={<ShieldCheck size={13} />}
                        onClick={() =>
                          patch(activeLabel.id, { reviewed: true, selected: true })
                        }
                      >
                        Mark verified
                      </Button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title="No label selected" body="Pick a row to preview its label." />
            )}
          </Card>
        </div>
      ) : (
        /* ── Print sheet tab ─────────────────────────────────── */
        <>
          <div className="rounded-[14px] border border-[#e4e7ec] bg-surface p-4 shadow-[0_1px_1px_rgba(16,24,40,0.03),0_8px_22px_-14px_rgba(16,24,40,0.18)] sm:p-[18px]">
            {toPrint.length === 0 ? (
              <EmptyState
                title="Nothing to print"
                body="Select at least one label, and resolve any that are flagged for review."
              />
            ) : (
              <div
                className="sheet-grid"
                style={{ ['--sheet-cols' as string]: String(settings.labelsPerRow) }}
              >
                {toPrint.map((label) => (
                  <ShipLabel
                    key={label.id}
                    label={label}
                    settings={settings}
                    batchRef={activeBatch.ref}
                  />
                ))}
              </div>
            )}
          </div>
          <p className="mb-0 mt-3.5 text-center text-[12px] text-ink-5">
            Prints {settings.labelsPerRow === 1 ? 'one label' : 'two labels'} per row on{' '}
            {settings.paperSize}. Nothing is uploaded.
          </p>
        </>
      )}

      <EditLabelDialog
        label={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        onSave={(p) => editing && patch(editing.id, p)}
      />
    </div>
  );
}

/* ── Small local primitives ────────────────────────────────────── */

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'border-b border-line bg-surface px-3 py-2.5 text-left',
        'text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-4',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2.5', className)}>{children}</td>;
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="cursor-pointer rounded border border-line bg-surface px-1.5 py-1 text-ink-3 hover:bg-canvas"
    >
      {children}
    </button>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line-faint py-1.5 text-[12.5px] first:border-t-0">
      <span className="shrink-0 text-ink-4">{label}</span>
      <span className={cn('min-w-0 truncate text-right', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
