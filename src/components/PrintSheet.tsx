import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { ShipLabel } from './ShipLabel';
import type { Label, TemplateSettings } from '../lib/types';

/**
 * The print root.
 *
 * Rendered into a portal on <body> so print CSS can hide the entire app
 * shell with `body > *:not(#print-root)` and show only this. That is what
 * makes printing honour the selected layout — v1 printed the live DOM and
 * hard-forced two columns regardless of what the operator chose.
 *
 * The column count and page geometry come from the template settings via
 * CSS custom properties, so the setting genuinely drives paper output.
 */
export function PrintSheet({
  labels,
  settings,
  batchRef,
}: {
  labels: Label[];
  settings: TemplateSettings;
  batchRef: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let node = document.getElementById('print-root');
    if (!node) {
      node = document.createElement('div');
      node.id = 'print-root';
      document.body.appendChild(node);
    }
    setHost(node);
  }, []);

  // Drive @page from the chosen paper size and margin.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--page-size', settings.paperSize);
    root.style.setProperty('--page-margin', `${settings.marginMm}mm`);
  }, [settings.paperSize, settings.marginMm]);

  if (!host) return null;

  return createPortal(
    <div
      className="sheet-grid"
      style={{ ['--sheet-cols' as string]: String(settings.labelsPerRow) }}
    >
      {labels.map((label) => (
        <ShipLabel key={label.id} label={label} settings={settings} batchRef={batchRef} />
      ))}
    </div>,
    host,
  );
}
