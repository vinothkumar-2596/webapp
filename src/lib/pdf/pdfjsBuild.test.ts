import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard: every pdf.js import must come from `pdfjs-dist/legacy/build/*`.
 *
 * pdf.js v6's default build calls Promise.try, Promise.withResolvers,
 * Math.sumPrecise and URL.parse and ships no polyfills for them. Math.sumPrecise
 * is Chrome 137+, so on an older Android WebView, Samsung Internet, iOS Safari
 * or Firefox the worker throws mid-parse and the UI reports "This PDF cannot be
 * read". The legacy/ build bundles core-js polyfills for 36+ built-ins into
 * whichever scope loads it — main thread AND worker.
 *
 * This has been reverted more than once, so it is pinned by a test rather than
 * by a comment. See CLAUDE.md. Types are identical: legacy/build/pdf.d.mts is
 * `export * from "pdfjs-dist"`.
 */

const SRC = join(import.meta.dirname, '..', '..');
const CODE = /\.(ts|tsx|js|jsx|mts)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return CODE.test(entry) ? [full] : [];
  });
}

/** Runtime pdf.js imports only — `pdfjs-dist/types/...` is type-only and fine. */
function badImports(text: string): string[] {
  const hits: string[] = [];
  // import ... from 'pdfjs-dist'  |  import('pdfjs-dist')  — the bare specifier
  if (/from\s+['"]pdfjs-dist['"]|import\(\s*['"]pdfjs-dist['"]\s*\)/.test(text)) {
    hits.push("bare 'pdfjs-dist'");
  }
  // any non-legacy build path, e.g. 'pdfjs-dist/build/pdf.worker.min.mjs'
  if (/['"]pdfjs-dist\/build\//.test(text)) {
    hits.push("'pdfjs-dist/build/...'");
  }
  return hits;
}

describe('pdf.js build selection', () => {
  const files = sourceFiles(SRC).filter((f) => !f.endsWith('pdfjsBuild.test.ts'));

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('imports pdf.js only from pdfjs-dist/legacy/build/*', () => {
    const offenders = files
      .map((file) => ({ file, hits: badImports(readFileSync(file, 'utf8')) }))
      .filter(({ hits }) => hits.length > 0)
      .map(({ file, hits }) => `${file.slice(SRC.length + 1)}: ${hits.join(', ')}`);

    expect(
      offenders,
      'Use pdfjs-dist/legacy/build/* instead — the default build ships no ' +
        'polyfills for Math.sumPrecise (Chrome 137+) and breaks PDF parsing on ' +
        'older mobile browsers. See CLAUDE.md.',
    ).toEqual([]);
  });

  it('the legacy build really does carry the polyfills', async () => {
    // Strip the built-ins, import the legacy worker bundle, confirm it restores
    // them. This is what an old mobile browser's worker scope experiences.
    const names = ['try', 'withResolvers'] as const;
    const saved = names.map((n) => [n, Promise[n]] as const);
    delete (Promise as Partial<PromiseConstructor>)[names[0]];
    delete (Promise as Partial<PromiseConstructor>)[names[1]];

    try {
      await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
      expect(typeof Promise.try).toBe('function');
      expect(typeof Promise.withResolvers).toBe('function');
      expect(typeof (Math as { sumPrecise?: unknown }).sumPrecise).toBe('function');
    } finally {
      for (const [n, fn] of saved) {
        if (fn) (Promise as unknown as Record<string, unknown>)[n] = fn;
      }
    }
  });
});
