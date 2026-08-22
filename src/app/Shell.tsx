import { type ReactNode } from 'react';
import { QrCode, ShoppingBag } from 'lucide-react';
import { useStore } from './store';

/**
 * Header — the brand/logo block only. No nav bar and no settings gear here;
 * Settings lives in the upload card's header bar (and can be reached from the
 * home/upload screen). Clicking the logo returns to the upload screen.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { screen, navigate } = useStore();

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-[#e0e0de] bg-surface shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex h-14 max-w-[900px] items-center px-4">
          {/* Brand / logo */}
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
        </div>
      </header>

      <main className={screen === 'import' ? '' : 'px-4 py-5'}>{children}</main>
    </div>
  );
}
