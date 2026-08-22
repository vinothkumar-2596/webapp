import * as Dialog from '@radix-ui/react-dialog';
import { X, Trash2 } from 'lucide-react';
import { Button, Field, Input, Select, cn } from './ui';
import { useStore } from '../app/store';
import { PaperSize, type TemplateSettings } from '../lib/types';
import { clearAllData } from '../lib/storage';

/**
 * Minimal settings — a small popup behind the header gear icon, not a whole
 * screen. Only the controls that still do something are here: print paper /
 * margin, and clearing on-device data. The Word file is always A4.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings, dispatch } = useStore();
  const patch = (p: Partial<TemplateSettings>) => dispatch({ type: 'patchSettings', patch: p });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))]',
            '-translate-x-1/2 -translate-y-1/2',
            'max-h-[90dvh] overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl',
          )}
        >
          <div className="flex items-center justify-between border-b border-line bg-surface-muted px-5 py-3.5">
            <Dialog.Title className="m-0 text-[14px] font-semibold">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="cursor-pointer rounded-md border-0 bg-transparent p-1 text-ink-5 hover:text-ink"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3.5 px-5 py-4">
            <Field label="Paper size" hint="Used only when printing — the Word file is always A4.">
              <Select
                className="h-9 w-full"
                value={settings.paperSize}
                onChange={(e) => {
                  const parsed = PaperSize.safeParse(e.target.value);
                  if (parsed.success) patch({ paperSize: parsed.data });
                }}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </Select>
            </Field>

            <Field label="Print margin" hint="Millimetres of white space around the sheet.">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={40}
                  value={settings.marginMm}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (Number.isFinite(n)) patch({ marginMm: Math.min(40, Math.max(0, n)) });
                  }}
                  className="h-9 w-24 text-right"
                />
                <span className="text-[12.5px] text-ink-4">mm</span>
              </div>
            </Field>
          </div>

          <div className="border-t border-line px-5 py-4">
            <p className="m-0 mb-2 text-[11.5px] leading-relaxed text-ink-4">
              Batches, labels and settings are stored only on this device. Clear them when handing
              the machine over.
            </p>
            <Button
              variant="danger"
              icon={<Trash2 size={13} />}
              onClick={() => {
                if (
                  window.confirm(
                    'Permanently delete every batch, label and setting stored on this device?',
                  )
                ) {
                  void clearAllData().then(() => window.location.reload());
                }
              }}
            >
              Clear local data
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
