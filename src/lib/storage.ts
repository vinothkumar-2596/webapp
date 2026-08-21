import { get, set, del } from 'idb-keyval';
import { Batch, TemplateSettings, DEFAULT_SETTINGS } from './types';

/**
 * Local persistence.
 *
 * v1 kept everything in memory — a page refresh destroyed an entire batch,
 * which was its worst day-to-day failure. Batches now live in IndexedDB on
 * the operator's device.
 *
 * Still zero server involvement: customer addresses never leave the machine.
 *
 * ⚠️  iOS Safari evicts site storage after roughly seven days of inactivity.
 *     For iPad/iPhone pack stations, treat local storage as a convenience,
 *     not a guarantee — print or export before leaving a batch idle.
 */

const K_BATCHES = 'label-console/batches';
const K_SETTINGS = 'label-console/settings';
const K_SEQUENCE = 'label-console/batch-sequence';

/** Cap on retained batches. Keeps IndexedDB bounded on shared machines. */
const MAX_BATCHES = 50;

export async function loadBatches(): Promise<Batch[]> {
  try {
    const raw = await get(K_BATCHES);
    if (!Array.isArray(raw)) return [];

    // Validate on read. Data written by an older build that no longer matches
    // the schema is dropped rather than crashing the app.
    const out: Batch[] = [];
    for (const item of raw) {
      const parsed = Batch.safeParse(item);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  } catch {
    return [];
  }
}

export async function saveBatches(batches: Batch[]): Promise<void> {
  const trimmed = [...batches]
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, MAX_BATCHES);
  await set(K_BATCHES, trimmed);
}

export async function loadSettings(): Promise<TemplateSettings> {
  try {
    const raw = await get(K_SETTINGS);
    const parsed = TemplateSettings.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: TemplateSettings): Promise<void> {
  await set(K_SETTINGS, settings);
}

/** Next batch reference number. Monotonic across sessions. */
export async function nextSequence(): Promise<number> {
  const raw = await get(K_SEQUENCE);
  const current = typeof raw === 'number' && Number.isFinite(raw) ? raw : 2840;
  const next = current + 1;
  await set(K_SEQUENCE, next);
  return next;
}

/**
 * Erase every trace of local data.
 *
 * Exposed in the UI as "Clear local data" — required for GDPR hygiene on
 * shared warehouse machines, where customer addresses would otherwise sit
 * in IndexedDB indefinitely.
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([del(K_BATCHES), del(K_SETTINGS), del(K_SEQUENCE)]);
}
