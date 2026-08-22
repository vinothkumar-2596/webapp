import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { ShipLabel } from './ShipLabel';
import type { Label, TemplateSettings } from '../lib/types';

/**
 * The print root.
 *
 * Rendered into a portal on <body> so print CSS can hide the entire app
 * shell with `body > *:not(#print-root)` and show only this.
 *
 * Output is a FIXED A4 grid: every page is 2 columns × 3 rows = 6 equal
 * cells, and each label fills exactly one cell at a constant size no matter
 * how many labels there are. Labels are laid out in page order — 6 per sheet,
 * page 1 takes labels 1–6, page 2 takes 7–12, and so on — with the last
 * sheet's unused cells left blank. This mirrors the Word export and the
 * on-screen preview 1:1.
 *
 * Sheets are sized in millimetres (not driven by content) so a 1-page PDF and
 * a 1020-page PDF both print the same fixed label size.
 */

const COLS = 2;
const ROWS = 3;
const PER_PAGE = COLS * ROWS; // 6

// Physical portrait page size in millimetres per paper choice, so printed
// cells are identical on every page regardless of label count.
const PAGE_MM: Record<TemplateSettings['paperSize'], { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Letter: { w: 216, h: 279 },
};

/** Split a flat list into fixed-size pages. */
function paginate<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

export function PrintSheet({
  labels,
  settings,
}: {
  labels: Label[];
  settings: TemplateSettings;
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

  // Drive @page from the chosen paper size. Page margins are applied inside
  // each sheet (as padding) so the 2×3 grid can be sized to exact millimetres,
  // so @page itself is margin-free.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--page-size', settings.paperSize);
    root.style.setProperty('--page-margin', '0mm');
  }, [settings.paperSize]);

  if (!host) return null;

  // One label per PDF page, in page order; exactly 6 labels per fixed A4 sheet.
  const ordered = [...labels].sort((a, b) => a.pageNumber - b.pageNumber);
  const pages = ordered.length > 0 ? paginate(ordered, PER_PAGE) : [[]];
  const page = PAGE_MM[settings.paperSize];

  return createPortal(
    <>
      {pages.map((pageLabels, pageIdx) => (
        <div
          key={pageIdx}
          className="print-sheet"
          style={{
            width: `${page.w}mm`,
            height: `${page.h}mm`,
            padding: `${settings.marginMm}mm`,
          }}
        >
          <div className="print-grid">
            {Array.from({ length: PER_PAGE }).map((_, cellIdx) => {
              const label = pageLabels[cellIdx];
              // Fixed empty cell — keeps every sheet a full 2×3 grid even when
              // the last page isn't full (e.g. 10 labels → page 2 has 2 blanks).
              if (!label) {
                return <div key={cellIdx} aria-hidden className="print-cell print-cell--empty" />;
              }
              return (
                <div key={label.id} className="print-cell">
                  <ShipLabel label={label} bare />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>,
    host,
  );
}
