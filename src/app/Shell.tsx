import { useMemo, type ReactNode } from 'react';
import { History, LayoutDashboard, Settings, ShoppingBag, Upload } from 'lucide-react';
import { useStore, type Screen } from './store';
import { cn } from '../components/ui';

const NAV: { id: Screen; label: string; icon: typeof History }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'batches', label: 'Batches', icon: History },
  { id: 'template', label: 'Settings', icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const { screen, navigate, activeBatch, batches } = useStore();

  const labelCount = useMemo(
    () => batches.reduce((total, batch) => total + batch.labels.length, 0),
    [batches],
  );

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-40 h-14 border-b border-line bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-[1100px] items-center gap-3 px-4 sm:px-5">
          <button
            type="button"
            onClick={() => navigate('import')}
            className="flex min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left"
            aria-label="Open PDF importer"
          >
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-brand text-white shadow-sm">
              <ShoppingBag size={16} strokeWidth={2} />
            </span>
            <span className="truncate text-[15px] font-bold text-ink">Vape From France</span>
          </button>

          <span className="hidden h-5 w-px bg-line sm:block" />
          <span className="hidden whitespace-nowrap text-[12px] text-ink-4 sm:block">
            QR shipping labels
          </span>

          <span className="min-w-2 flex-1" />

          {screen === 'batches' && activeBatch ? (
            <span className="hidden whitespace-nowrap text-[12.5px] text-ink-3 md:block">
              <span className="font-mono font-medium text-ink">{activeBatch.labels.length}</span>{' '}
              labels ready
            </span>
          ) : labelCount > 0 ? (
            <span className="hidden whitespace-nowrap text-[12px] text-ink-4 lg:block">
              {labelCount} saved locally
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
                    'flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors',
                    active
                      ? 'border-ok-line bg-ok-bg text-brand'
                      : 'border-transparent bg-transparent text-ink-4 hover:border-line hover:bg-surface-muted hover:text-ink',
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
              'flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors',
              screen === 'import'
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-ink-2 hover:border-brand hover:text-brand',
            )}
          >
            <Upload size={14} />
            <span className="hidden sm:inline">New PDF</span>
          </button>
        </div>
      </header>

      <main className={screen === 'import' ? '' : 'px-4 py-5 sm:px-5'}>{children}</main>
    </div>
  );
}
