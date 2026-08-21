import { useMemo } from 'react';
import { Upload, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { useStore } from '../app/store';
import { Badge, Button, Card, CardHeader, EmptyState, cn } from '../components/ui';
import { needsReview, type Batch } from '../lib/types';

/**
 * Dispatch overview.
 *
 * Every figure here is computed from batches actually stored on this device.
 * Nothing is mocked — if a number cannot be derived from real local data, it
 * is not shown.
 */
export function OverviewScreen() {
  const { batches, dispatch, navigate } = useStore();

  const kpis = useMemo(() => {
    const today = new Date().toDateString();
    const todays = batches.filter((b) => new Date(b.importedAt).toDateString() === today);

    const labelsToday = todays.reduce((n, b) => n + b.labels.length, 0);
    const totalLabels = batches.reduce((n, b) => n + b.labels.length, 0);
    const flagged = batches.reduce((n, b) => n + b.labels.filter(needsReview).length, 0);
    const parsed = batches.reduce(
      (n, b) => n + b.labels.filter((l) => l.source === 'parsed').length,
      0,
    );
    const clean = batches.reduce(
      (n, b) => n + b.labels.filter((l) => l.source === 'parsed' && l.reviewReasons.length === 0).length,
      0,
    );
    const rate = parsed > 0 ? (clean / parsed) * 100 : null;
    const unprinted = batches.filter((b) => b.printedAt === null).length;

    return { labelsToday, totalLabels, flagged, rate, unprinted, todayCount: todays.length };
  }, [batches]);

  if (batches.length === 0) {
    return (
      <div className="mx-auto max-w-[760px]">
        <Card>
          <EmptyState
            icon={<Layers size={28} />}
            title="Nothing imported yet"
            body="Upload an Amazon packing-slip PDF and the console will extract every recipient, generate QR labels, and flag anything it could not read."
            action={
              <Button variant="primary" icon={<Upload size={14} />} onClick={() => navigate('import')}>
                New import
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px]">
      <div className="mb-4.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20px] font-semibold tracking-[-0.3px]">Dispatch overview</h1>
          <p className="mt-1.5 text-[13px] text-ink-4">
            {batches.length} batch{batches.length === 1 ? '' : 'es'} stored on this device ·{' '}
            {kpis.totalLabels} labels total
          </p>
        </div>
        <Button variant="primary" icon={<Upload size={14} />} onClick={() => navigate('import')}>
          New import
        </Button>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <div className="mb-4.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi
          label="Labels today"
          value={String(kpis.labelsToday)}
          note={`${kpis.todayCount} batch${kpis.todayCount === 1 ? '' : 'es'} imported today`}
        />
        <Kpi
          label="Awaiting print"
          value={String(kpis.unprinted)}
          note={kpis.unprinted === 0 ? 'All batches printed' : 'Batches not yet printed'}
          tone={kpis.unprinted > 0 ? 'warn' : 'ok'}
        />
        <Kpi
          label="Parse success"
          value={kpis.rate === null ? '—' : `${kpis.rate.toFixed(1)}%`}
          note="Pages parsed with no missing fields"
          tone={kpis.rate !== null && kpis.rate < 95 ? 'warn' : 'ok'}
        />
        <Kpi
          label="Needs review"
          value={String(kpis.flagged)}
          note={kpis.flagged === 0 ? 'Nothing flagged' : 'Blocked from printing'}
          tone={kpis.flagged > 0 ? 'bad' : 'ok'}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
        {/* ── Recent batches ────────────────────────────────────── */}
        <Card className="min-w-0">
          <CardHeader
            title="Recent batches"
            action={
              <button
                type="button"
                onClick={() => navigate('batches')}
                className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-brand"
              >
                View all
              </button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="bg-surface-muted">
                  {['Batch', 'Source file', 'Labels', 'Operator', 'Status'].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'border-b border-line px-3 py-2.5 text-left',
                        'text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-4',
                        i === 2 && 'text-right',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.slice(0, 8).map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => dispatch({ type: 'openBatch', batchId: b.id })}
                    className="cursor-pointer border-b border-line-soft hover:bg-surface-muted"
                  >
                    <td className="px-3 py-3 font-mono text-[12.5px] font-medium">{b.ref}</td>
                    <td className="max-w-[220px] truncate px-3 py-3 text-[12.5px] text-ink-2">
                      {b.fileName}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-[12.5px]">
                      {b.labels.length}
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-ink-2">{b.operator}</td>
                    <td className="px-3 py-3">
                      <BatchStatus batch={b} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Requires attention ────────────────────────────────── */}
        <Card>
          <CardHeader title="Requires attention" />
          <div className="flex flex-col gap-2.5 p-4">
            {kpis.flagged === 0 ? (
              <div className="flex items-start gap-2.5 rounded-md border border-ok-line bg-ok-bg p-3">
                <CheckCircle2 size={15} className="mt-px shrink-0 text-ok-fg" />
                <div>
                  <div className="text-[12.5px] font-semibold">Everything parsed cleanly</div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-ink-4">
                    No labels are missing an order number, recipient, address, or country.
                  </div>
                </div>
              </div>
            ) : (
              batches
                .filter((b) => b.labels.some(needsReview))
                .slice(0, 4)
                .map((b) => {
                  const n = b.labels.filter(needsReview).length;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => dispatch({ type: 'openBatch', batchId: b.id })}
                      className="flex cursor-pointer items-start gap-2.5 rounded-md border border-warn-line bg-warn-bg p-3 text-left"
                    >
                      <AlertTriangle size={15} className="mt-px shrink-0 text-warn-icon" />
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold">
                          {n} label{n === 1 ? '' : 's'} could not be fully parsed
                        </div>
                        <div className="mt-0.5 truncate text-[11.5px] leading-snug text-ink-4">
                          Batch {b.ref} · {b.fileName}
                        </div>
                      </div>
                    </button>
                  );
                })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
}) {
  const colour =
    tone === 'bad' ? 'text-bad-fg' : tone === 'warn' ? 'text-warn-fg' : tone === 'ok' ? 'text-ok-fg' : 'text-ink-4';
  return (
    <Card className="p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-4">
        {label}
      </div>
      <div className="mt-2.5 font-mono text-[27px] font-semibold tracking-[-0.8px]">{value}</div>
      <div className={cn('mt-1.5 text-[11.5px]', colour)}>{note}</div>
    </Card>
  );
}

function BatchStatus({ batch }: { batch: Batch }) {
  const flagged = batch.labels.filter(needsReview).length;
  if (flagged > 0) return <Badge tone="warn">{flagged} to review</Badge>;
  if (batch.printedAt) return <Badge tone="ok">Printed</Badge>;
  return <Badge tone="neutral">Queued</Badge>;
}
