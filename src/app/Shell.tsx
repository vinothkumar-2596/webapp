import { useState, type ReactNode } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { useStore } from './store';
import { cn } from '../components/ui';
import { SettingsDialog } from '../components/SettingsDialog';

/**
 * App chrome.
 *
 * The top nav bar has been removed. The app renders chrome-free with just a
 * small floating gear in the corner for Settings. New PDF is still reachable —
 * the label screen has its own action row.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { screen } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={() => setSettingsOpen(true)}
        className="fixed right-3 top-3 z-40 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface/90 text-ink-4 shadow-sm backdrop-blur transition-colors hover:text-ink"
      >
        <SettingsIcon size={15} />
      </button>

      <main className={screen === 'import' ? '' : cn('px-4 py-5 pt-12')}>
        {children}
      </main>
    </div>
  );
}
