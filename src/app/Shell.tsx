import { useMemo, type ReactNode } from 'react';
import { History, LayoutDashboard, QrCode, Settings, ShoppingBag, Upload } from 'lucide-react';
import { useStore, type Screen } from './store';
import { cn } from '../components/ui';

/**
 * Header, in the original v1 presentation.
 *
 * The brand block reproduces v1 exactly — emerald tile, Outfit wordmark with
 * "DE FRANCE" picked out in green, the QR Labels pill and the
 * "Amazon PDF → QR Shipping Labels" strapline.
 *
 * v1 had no navigation because it had a single screen. This build has four,
 * so the nav is kept on the right in the same emerald palette; removing it
 * would strand Batches and Settings with no way back.
 */

const NAV: { id: Screen; label: string; icon: typeof History }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'batches', label: 'Batches', icon: History },
  { id: 'template', label: 'Settings', icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const { screen, navigate, batches } = useStore();

  const labelCount = useMemo(
    () => batches.reduce((total, batch) => total + batch.labels.length, 0),
    [batches],
  );

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-[#e0e0de] bg-surface shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-2 overflow-hidden px-4">
          {/* Brand — v1 */}
          <button
            type="button"
            onClick={() => navigate('import')}
            className="flex min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left"
            aria-label="Open PDF importer"
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-brand shadow-[0_4px_10px_rgba(16,185,129,0.28)]">
              <ShoppingBag size={17} color="#fff" />
            </span>

            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-display text-[clamp(14px,4vw,18px)] font-black tracking-[-0.3px] whitespace-nowrap text-[#111827]">
                  VAPE <span className="text-brand">DE FRANCE</span>
                </span>
                <span className="hidden items-center gap-[3px] rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-[#6b7280] min-[420px]:flex">
                  <QrCode size={10} className="text-brand" />
                  QR Labels
                </span>
              </span>
              <span className="block truncate text-[10px] font-medium text-[#9ca3af]">
                Amazon PDF → QR Shipping Labels
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            {labelCount > 0 ? (
              <span className="hidden rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-[5px] text-[12px] font-bold whitespace-nowrap text-[#374151] sm:block">
                {labelCount} label{labelCount === 1 ? '' : 's'}
              </span>
            ) : null}

            <nav className="flex items-center gap-1" aria-label="Application navigation">
              {NAV.map(({ id, label, icon: Icon }) => {
                const active = screen === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => navigate(id)}
                    aria-current={active ? 'page' : undefined}
                    aria-label={label}
                    title={label}
                    className={cn(
                      'flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold transition-colors',
                      active
                        ? 'border-ok-line bg-ok-bg text-brand'
                        : 'border-transparent bg-transparent text-[#6b7280] hover:border-[#e5e7eb] hover:bg-[#f9fafb] hover:text-ink',
                    )}
                  >
                    <Icon size={14} />
                    <span className="hidden lg:inline">{label}</span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => navigate('import')}
              className={cn(
                'flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 px-3 text-[12.5px] font-bold transition-colors',
                screen === 'import'
                  ? 'bg-brand text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)]'
                  : 'bg-[#f3f4f6] text-[#374151] hover:bg-brand hover:text-white',
              )}
            >
              <Upload size={14} />
              <span className="hidden sm:inline">New PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className={screen === 'import' ? '' : 'px-4 py-5 sm:px-5'}>{children}</main>
    </div>
  );
}
