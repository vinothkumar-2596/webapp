/**
 * Line reconstruction — pure, no pdf.js import.
 *
 * PDF text is a bag of positioned glyph runs, not lines. This module turns
 * those runs back into visual lines. It is deliberately free of any pdf.js
 * dependency so it can be unit-tested in a plain Node environment.
 */

/** One page of a PDF, reconstructed into visual lines. */
export interface PageText {
  pageNumber: number;
  /** Lines top-to-bottom, each reading left-to-right. */
  lines: string[];
  /** All lines joined by newlines. Convenience for whole-page regex matching. */
  raw: string;
}

export interface Run {
  /** X position of the run's left edge, in PDF points. */
  x: number;
  /** Y position of the run's baseline, in PDF points (origin bottom-left). */
  y: number;
  text: string;
  /** Advance width of the run, in points. */
  width: number;
}

/**
 * Vertical tolerance for treating two runs as being on the same line.
 *
 * v1 snapped Y to a fixed 4pt grid, which splits a line whenever it straddles
 * a grid boundary — two runs 1pt apart could land in different buckets.
 * Clustering by proximity instead is boundary-independent.
 */
export const LINE_TOLERANCE_PT = 3.2;

/**
 * Horizontal gap above which a space is inserted between runs.
 *
 * v1 joined every run with ' ', injecting spaces mid-word wherever a PDF
 * split a word across runs for kerning — producing "Pa ris".
 */
export const SPACE_GAP_PT = 1.2;

export function runsToLines(runs: Run[]): string[] {
  if (runs.length === 0) return [];

  // Cluster by Y proximity, top first (PDF origin is bottom-left).
  const sorted = [...runs].sort((a, b) => b.y - a.y);
  const clusters: Run[][] = [];

  for (const run of sorted) {
    const last = clusters[clusters.length - 1];
    const anchor = last?.[0];
    if (last && anchor && Math.abs(anchor.y - run.y) <= LINE_TOLERANCE_PT) {
      last.push(run);
    } else {
      clusters.push([run]);
    }
  }

  return clusters
    .map((cluster) => {
      const ordered = [...cluster].sort((a, b) => a.x - b.x);
      let line = '';
      let cursorX: number | null = null;

      for (const run of ordered) {
        if (cursorX !== null) {
          const gap = run.x - cursorX;
          // Only insert a space where the PDF left an actual visual gap.
          if (gap > SPACE_GAP_PT && !line.endsWith(' ') && !run.text.startsWith(' ')) {
            line += ' ';
          }
        }
        line += run.text;
        cursorX = run.x + run.width;
      }

      return line.replace(/\s+/g, ' ').trim();
    })
    .filter((l) => l.length > 0);
}
