import { useState, type ReactNode } from 'react';
import { Settings as SettingsIcon, ShoppingBag, Upload } from 'lucide-react';
import { useStore } from './store';
import { cn } from '../components/ui';
import { SettingsDialog } from '../components/SettingsDialog';

/**
 * Minimal header: the brand on the left and a single "New PDF" action on the
 * right. There is no dashboard, no settings, and no batch history — the app is
 * one flow: upload a PDF, review the labels, download or print.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { screen, navigate } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <header className="sticky top-0 z-30 border-b border-[#e0e0de] bg-surface shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex h-14 max-w-[900px] items-center justify-between gap-2 px-4">
          <button
            type="button"
            onClick={() => navigate('import')}
            className="flex min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left"
            aria-label="Home — upload a PDF"
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-brand shadow-[0_4px_10px_rgba(16,185,129,0.28)]">
              <ShoppingBag size={17} color="#fff" />
            </span>
            <span className="min-w-0">
              <span className="font-display block text-[16px] font-black tracking-[-0.3px] whitespace-nowrap text-[#111827]">
                VAPE <span className="text-brand">DE FRANCE</span>
              </span>
              <span className="block truncate text-[10px] font-medium text-[#9ca3af]">
                Amazon PDF → QR Shipping Labels
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Settings"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280] transition-colors hover:bg-white hover:text-ink"
            >
              <SettingsIcon size={15} />
            </button>

            <button
              type="button"
              onClick={() => navigate('import')}
              className={cn(
                'flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 px-3 text-[12.5px] font-bold transition-colors',
                screen === 'import'
                  ? 'bg-brand text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)]'
                  : 'bg-[#f3f4f6] text-[#374151] hover:bg-brand hover:text-white',
              )}
            >
              <Upload size={14} />
              <span>New PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className={screen === 'import' ? '' : 'px-4 py-5'}>{children}</main>
    </div>
  );
}
