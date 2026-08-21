/**
 * Identifier generation.
 *
 * `crypto.randomUUID` is unavailable in two situations this app actually hits:
 *
 *  1. **Insecure contexts.** It is secure-context-only, so it is `undefined`
 *     over plain `http://` — which is exactly how the app is reached when
 *     testing against `npm run preview` on a LAN IP.
 *  2. **iOS Safari before 15.4**, where it was never implemented.
 *
 * Either way `crypto.randomUUID()` throws
 * `TypeError: crypto.randomUUID is not a function` and the import dies after
 * the PDF has already been parsed successfully.
 *
 * `crypto.getRandomValues`, by contrast, is available in insecure contexts and
 * has shipped since iOS 6, so the fallback is still cryptographically sound.
 * The last resort exists only so a hostile/stripped environment degrades
 * instead of crashing.
 */

/** RFC 4122 version 4 UUID built from CSPRNG bytes. */
function uuidFromRandomBytes(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Version 4, variant 10xx.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push((bytes[i] ?? 0).toString(16).padStart(2, '0'));
  }

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

let weakCounter = 0;

/** A unique id, using the strongest source this engine offers. */
export function newId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto.getRandomValues === 'function') return uuidFromRandomBytes();
  }
  weakCounter += 1;
  return 'id-' + String(weakCounter) + '-' + Math.random().toString(36).slice(2, 10);
}
