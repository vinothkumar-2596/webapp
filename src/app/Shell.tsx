import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  ChevronsUpDown,
  FileStack,
  LayoutDashboard,
  Menu,
  Search,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import { useStore, type Screen } from './store';
import { cn } from '../components/ui';
import { needsReview } from '../lib/types';

/**
 * Application shell — dark operations rail + workspace header.
 *
 * The rail is fixed at 248px from `lg` up, matching the design. Below that it
 * becomes an overlay drawer: the operators who actually run this app are on
 * iPhones, where a fixed 248px rail would eat half the screen.
 *
 * Everything binds to real store state. The design's sample content (a named
 * supervisor, a parser build number, average parse timings) is deliberately
 * not reproduced as literal text — inventing operational figures in an app
 * whose whole premise is "never show data you did not actually read" would be
 * the same class of bug as v1's invented order numbers.
 */

const CRUMB: Record<Screen, string> = {
  overview: 'Dispatch overview',
  batches: 'Label batches',
  import: 'New import',
  template: 'Label template',
};

interface NavItem {
  id: Screen;
  label: string;
  icon: typeof LayoutDashboard;
  /** Rendered as a monospace count chip when greater than zero. */
  count?: number;
}

export function Shell({ children }: { children: ReactNode }) {
  const { screen, navigate, batches, search, dispatch, settings } = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { labelCount, reviewCount } = useMemo(() => {
    let labels = 0;
    let review = 0;
    for (const b of batches) {
      labels += b.labels.length;
      for (const l of b.labels) if (needsReview(l)) review += 1;
    }
    return { labelCount: labels, reviewCount: review };
  }, [batches]);

  // Cmd/Ctrl-K focuses search, matching the chip shown inside the field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const operations: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'batches', label: 'Label batches', icon: FileStack, count: batches.length },
    { id: 'import', label: 'New import', icon: Upload },
  ];
  const configuration: NavItem[] = [{ id: 'template', label: 'Label template', icon: Tag }];

  function go(next: Screen) {
    navigate(next);
    setDrawerOpen(false);
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 cursor-default border-0 bg-ink/45 lg:hidden"
        />
      ) : null}

      <Rail
        screen={screen}
        operations={operations}
        configuration={configuration}
        labelCount={labelCount}
        operatorName={settings.operatorName}
        open={drawerOpen}
        onNavigate={go}
        onClose={() => setDrawerOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 flex-none items-center gap-3 border-b border-line bg-surface px-3 sm:gap-4 sm:px-[22px]">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-ink-3 hover:bg-canvas lg:hidden"
          >
            <Menu size={16} />
          </button>

          <div className="hidden flex-none items-center gap-2 whitespace-nowrap text-[12.5px] text-ink-4 sm:flex">
            <span>Operations</span>
            <span className="text-[#b9c0c9]">/</span>
            <span className="font-medium text-ink">{CRUMB[screen]}</span>
          </div>

          <div className="min-w-2 flex-1" />

          <label className="flex h-8 w-full min-w-0 shrink items-center gap-2 overflow-hidden rounded-md border border-line bg-surface-muted px-2.5 focus-within:border-brand sm:w-[250px] sm:flex-none">
            <Search size={14} className="flex-none text-ink-5" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => dispatch({ type: 'setSearch', value: e.target.value })}
              placeholder="Search order ID or recipient"
              className="w-full min-w-0 border-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-5"
            />
            {search ? (
              <button
                type="button"
                onClick={() => dispatch({ type: 'setSearch', value: '' })}
                aria-label="Clear search"
                className="flex-none cursor-pointer border-0 bg-transparent p-0 text-ink-5 hover:text-ink"
              >
                <X size={13} />
              </button>
            ) : (
              <span className="hidden flex-none rounded-[3px] border border-line bg-surface px-1 py-px font-mono text-[10px] text-ink-6 sm:block">
                &#8984;K
              </span>
            )}
          </label>

          <button
            type="button"
            onClick={() => go('batches')}
            title={reviewCount > 0 ? `${reviewCount} labels need review` : 'Nothing needs review'}
            aria-label={
              reviewCount > 0 ? `${reviewCount} labels need review` : 'No labels need review'
            }
            className="relative flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-ink-3 hover:bg-canvas"
          >
            <Bell size={15} />
            {reviewCount > 0 ? (
              <span className="absolute top-1.5 right-[7px] h-[5px] w-[5px] rounded-full bg-bad-icon" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => go('import')}
            className="flex h-8 flex-none cursor-pointer items-center gap-[7px] rounded-md border-0 bg-brand px-3.5 text-[12.5px] font-semibold whitespace-nowrap text-white hover:bg-brand-hover"
          >
            <Upload size={14} />
            <span className="hidden sm:inline">New import</span>
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function Rail({
  screen,
  operations,
  configuration,
  labelCount,
  operatorName,
  open,
  onNavigate,
  onClose,
}: {
  screen: Screen;
  operations: NavItem[];
  configuration: NavItem[];
  labelCount: number;
  operatorName: string;
  open: boolean;
  onNavigate: (s: Screen) => void;
  onClose: () => void;
}) {
  const initials = useMemo(() => {
    const parts = operatorName.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '--';
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase();
  }, [operatorName]);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-none flex-col border-r border-rail-edge bg-rail transition-transform duration-200 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex items-center gap-[11px] border-b border-white/10 px-[18px] pt-[18px] pb-4">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[7px] bg-brand">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 7h18v13H3z" />
            <path d="M3 7l2-4h14l2 4" />
            <path d="M9 11h6" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] leading-tight font-semibold tracking-[-0.1px] text-white">
            Vape From France
          </div>
          <div className="mt-0.5 text-[11px] leading-[1.4] tracking-[0.02em] text-rail-muted">
            Label Console
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-rail-muted hover:bg-white/10 lg:hidden"
        >
          <X size={15} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2.5 py-3.5">
        <RailLabel className="pt-1.5">Operations</RailLabel>
        {operations.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={screen === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}

        <RailLabel className="pt-5">Configuration</RailLabel>
        {configuration.map((item) => (
          <RailButton
            key={item.id}
            item={item}
            active={screen === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>

      <div className="m-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-[11px]">
        <div className="mb-[7px] flex items-center gap-2">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-brand-pulse" />
          <span className="text-[11.5px] font-semibold text-[#d6dee9]">Parser</span>
        </div>
        <div className="text-[11px] leading-[1.45] text-rail-muted">
          Runs on this device
          <br />
          {labelCount === 0
            ? 'No labels stored yet'
            : `${labelCount} label${labelCount === 1 ? '' : 's'} stored locally`}
        </div>
      </div>

      <div className="flex items-center gap-2.5 border-t border-white/10 px-3.5 py-3">
        <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-rail-chip text-[11px] font-semibold text-rail-chip-fg">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-rail-strong">{operatorName}</div>
          <div className="text-[10.5px] text-[#7a8798]">Operator</div>
        </div>
        <ChevronsUpDown size={13} className="flex-none text-[#7a8798]" />
      </div>
    </aside>
  );
}

function RailLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'px-2.5 pb-2 text-[10.5px] font-semibold tracking-[0.09em] text-rail-label uppercase',
        className,
      )}
    >
      {children}
    </div>
  );
}

function RailButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const { label, icon: Icon, count } = item;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
        active ? 'bg-brand text-rail-fg-active' : 'bg-transparent text-rail-fg hover:bg-white/10',
      )}
    >
      <Icon size={16} className="flex-none" />
      <span className="flex-1 truncate">{label}</span>
      {count && count > 0 ? (
        <span
          className={cn(
            'flex-none rounded px-1.5 py-px font-mono text-[10.5px] font-medium',
            active ? 'bg-white/20 text-white' : 'bg-white/10 text-rail-muted',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
