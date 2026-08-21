import { Trash2, ShieldAlert } from 'lucide-react';
import { useStore } from '../app/store';
import { Button, Card, CardHeader, Input, Select, Toggle } from '../components/ui';
import { ShipLabel } from '../components/ShipLabel';
import { PaperSize, type Label, type TemplateSettings } from '../lib/types';
import { clearAllData } from '../lib/storage';

/** A representative label so the preview reflects settings, not real data. */
const SAMPLE: Label = {
  id: 'sample',
  pageNumber: 1,
  recipientName: { value: 'Camille Moreau', confidence: 'high' },
  address: {
    lines: ['14 Rue des Lilas'],
    postalCode: '69003',
    city: 'Lyon',
    country: { value: 'France', confidence: 'high' },
  },
  phone: { value: '06 12 34 56 78', confidence: 'high' },
  orderNumber: { value: '402-7719834-2210445', confidence: 'high' },
  product: { title: 'Sample product', sku: 'VDF-KIT-050', asin: 'B08NXK2LMQ', quantity: 2 },
  reviewReasons: [],
  reviewed: true,
  selected: true,
  source: 'parsed',
  parserVersion: '2.0.0',
};

export function TemplateScreen() {
  const { settings, dispatch } = useStore();

  const patch = (p: Partial<TemplateSettings>) => dispatch({ type: 'patchSettings', patch: p });

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4.5">
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.3px]">Label template</h1>
        <p className="mt-1.5 text-[13px] text-ink-4">
          Applies to every batch printed from this device. Changes take effect immediately.
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_356px]">
        <Card className="min-w-0">
          <SettingRow
            label="Labels per row"
            help="Layout used on screen and on paper. Unlike v1, this genuinely controls printed output."
          >
            <Select
              value={String(settings.labelsPerRow)}
              onChange={(e) => patch({ labelsPerRow: e.target.value === '1' ? 1 : 2 })}
            >
              <option value="2">2 labels</option>
              <option value="1">1 label</option>
            </Select>
          </SettingRow>

          <SettingRow label="Paper size" help="Drives the @page rule sent to the printer.">
            <Select
              value={settings.paperSize}
              onChange={(e) => {
                const parsed = PaperSize.safeParse(e.target.value);
                if (parsed.success) patch({ paperSize: parsed.data });
              }}
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
            </Select>
          </SettingRow>

          <SettingRow label="Page margin" help="Millimetres of white space around the sheet.">
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
                className="h-8 w-20 text-right"
              />
              <span className="text-[12.5px] text-ink-4">mm</span>
            </div>
          </SettingRow>

          <SettingRow label="QR scan hint" help="Prints a short caption under each QR code.">
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-ink-4">
                {settings.showScanHint ? 'Shown' : 'Hidden'}
              </span>
              <Toggle
                label="QR scan hint"
                checked={settings.showScanHint}
                onChange={(v) => patch({ showScanHint: v })}
              />
            </div>
          </SettingRow>

          <SettingRow
            label="Include batch reference"
            help="Adds the batch ID to every label for traceability."
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-ink-4">
                {settings.includeBatchRef ? 'Enabled' : 'Disabled'}
              </span>
              <Toggle
                label="Include batch reference"
                checked={settings.includeBatchRef}
                onChange={(v) => patch({ includeBatchRef: v })}
              />
            </div>
          </SettingRow>

          <SettingRow
            label="Require address verification"
            help="Blocks printing until flagged labels are reviewed. Turning this off allows labels with missing data onto parcels."
            danger={!settings.requireVerification}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[12.5px] text-ink-4">
                {settings.requireVerification ? 'Enforced' : 'Off'}
              </span>
              <Toggle
                label="Require address verification"
                checked={settings.requireVerification}
                onChange={(v) => patch({ requireVerification: v })}
              />
            </div>
          </SettingRow>

          <SettingRow label="Operator name" help="Recorded against every batch you import.">
            <Input
              value={settings.operatorName}
              onChange={(e) => patch({ operatorName: e.target.value })}
              className="h-8 w-44"
            />
          </SettingRow>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Live preview" />
            <div className="bg-surface-sunken px-4 py-4.5">
              <ShipLabel label={SAMPLE} settings={settings} batchRef="B-2847" size="preview" />
            </div>
            <div className="border-t border-line px-4 py-3.5 text-[11.5px] leading-relaxed text-ink-5">
              Sample data — no customer information is shown here.
            </div>
          </Card>

          {/* GDPR hygiene: shared warehouse machines must be clearable. */}
          <Card>
            <CardHeader title="Local data" />
            <div className="p-4">
              <p className="m-0 text-[12px] leading-relaxed text-ink-4">
                Batches, labels, and settings are stored in this browser only. Customer addresses
                never reach a server. Clear them when handing the machine over or at the end of a
                shift.
              </p>
              <div className="mt-3">
                <Button
                  variant="danger"
                  icon={<Trash2 size={13} />}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Permanently delete every batch, label, and setting stored on this device?',
                      )
                    ) {
                      void clearAllData().then(() => window.location.reload());
                    }
                  }}
                >
                  Clear local data
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  label,
  help,
  danger,
  children,
}: {
  label: string;
  help: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-5 border-b border-line-soft px-4 py-4 last:border-b-0">
      <div className="flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium">
          {danger ? <ShieldAlert size={14} className="text-bad-icon" /> : null}
          {label}
        </div>
        <div className={danger ? 'mt-1 text-[12px] leading-snug text-bad-fg' : 'mt-1 text-[12px] leading-snug text-ink-4'}>
          {help}
        </div>
      </div>
      <div className="flex shrink-0 justify-end">{children}</div>
    </div>
  );
}
