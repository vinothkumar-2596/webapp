import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  LayoutGrid,
  Layers,
  Upload,
  LayoutTemplate,
  Search,
  Bell,
  Plus,
  ShoppingBag,
  Menu,
  X,
} from 'lucide-react';
import { useStore, type Screen } from './store';
import { cn } from '../components/ui';
import { needsReview } from '../lib/types';

const NAV: { id: Screen; label: string; icon: typeof LayoutGrid; group: string }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'OPERATIONS' },
  { id: 'batches', label: 'Label batches', icon: Layers, group: 'OPERATIONS' },
  { id: 'import', label: 'New import', icon: Upload, group: 'OPERATIONS' },
  { id: 'template', label: 'Label template', icon: LayoutTemplate, group: 'CONFIGURATION' },
];

const CRUMB: Record<Screen, string> = {
  overview: 'Overview',
  batches: 'Label batches',
  import: 'New import',
  template: 'Label template',
};

export function Shell({ children }: { children: ReactNode }) {
  const { screen, navigate, batches, settings, search, dispatch } = useStore();
  const [navOpen, setNavOpen] = useState(false);

  const attention = useMemo(
    () => batches.reduce((n, b) => n + b.labels.filter(needsReview).length, 0),
    [batches],
  );

  // Close the mobile drawer whenever the screen changes.
  useEffect(() => setNavOpen(false), [screen]);

  // ⌘K / Ctrl+K focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const initials =
    settings.operatorName
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'OP';

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 border-0 bg-black/50 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          'z-50 flex w-[248px] shrink-0 flex-col border-r border-rail-edge bg-rail',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:transition-transform',
          navOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-white/8 px-4.5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-brand">
            <ShoppingBag size={17} color="#fff" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold leading-tight text-white">
              Vape From France
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-rail-muted">Label Console</div>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="cursor-pointer border-0 bg-transparent p-1 text-rail-muted lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2.5 py-3.5">
          {NAV.map((item, i) => {
            const prev = NAV[i - 1];
            const showGroup = !prev || prev.group !== item.group;
            const active = screen === item.id;
            const Icon = item.icon;
            const count = item.id === 'batches' ? batches.length : 0;

            return (
              <div key={item.id}>
                {showGroup ? (
                  <div
                    className={cn(
                      'px-2.5 pb-2 text-[10.5px] font-semibold tracking-[0.09em] text-rail-label',
                      i === 0 ? 'pt-1.5' : 'pt-5',
                    )}
                  >
                    {item.group}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 px-2.5 py-2',
                    'text-left text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-white/10 text-rail-fg-active'
                      : 'bg-transparent text-rail-fg hover:bg-white/7',
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 ? (
                    <span className="rounded bg-white/7 px-1.5 py-px font-mono text-[10.5px] font-medium text-rail-muted">
                      {count}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </nav>

        {/* Privacy statement — the app's defining property, stated plainly. */}
        <div className="m-2.5 rounded-lg border border-white/7 bg-white/5 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-pulse" />
            <span className="text-[11.5px] font-semibold text-[#d6dee9]">Local processing</span>
          </div>
          <div className="text-[11px] leading-snug text-rail-muted">
            PDFs are parsed in this browser.
            <br />
            No address ever leaves the device.
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-white/8 px-3.5 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rail-chip text-[11px] font-semibold text-rail-chip-fg">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium text-rail-strong">
              {settings.operatorName}
            </div>
            <button
              type="button"
              onClick={() => navigate('template')}
              className="cursor-pointer border-0 bg-transparent p-0 text-[10.5px] text-[#7a8798] hover:underline"
            >
              Change operator
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-5">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-ink-3 lg:hidden"
          >
            <Menu size={16} />
          </button>

          <div className="flex shrink-0 items-center gap-2 text-[12.5px] text-ink-4 max-sm:hidden">
            <span>Operations</span>
            <span className="text-[#b9c0c9]">/</span>
            <span className="font-medium text-ink">{CRUMB[screen]}</span>
          </div>

          <div className="min-w-2 flex-1" />

          <div className="flex h-8 min-w-0 flex-[0_1_250px] items-center gap-2 rounded-md border border-line bg-surface-muted px-2.5 focus-within:border-brand">
            <Search size={14} className="shrink-0 text-[#8b95a3]" />
            <input
              id="global-search"
              type="search"
              value={search}
              onChange={(e) => dispatch({ type: 'setSearch', value: e.target.value })}
              placeholder="Search order or recipient"
              className="w-full min-w-0 border-0 bg-transparent text-[12.5px] text-ink outline-none"
            />
            <span className="shrink-0 rounded border border-line bg-surface px-1 font-mono text-[10px] text-ink-6 max-sm:hidden">
              ⌘K
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('batches')}
            aria-label={`${attention} labels need review`}
            title={`${attention} labels need review`}
            className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-ink-3 hover:bg-canvas"
          >
            <Bell size={15} />
            {attention > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-[5px] w-[5px] rounded-full bg-bad-icon" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => navigate('import')}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border-0 bg-brand px-3 text-[12.5px] font-semibold text-white hover:bg-brand-hover"
          >
            <Plus size={14} />
            <span className="max-sm:hidden">New import</span>
          </button>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
