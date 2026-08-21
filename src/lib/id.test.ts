import { describe, it, expect, afterEach, vi } from 'vitest';
import { newId } from './id';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Reproduces iOS Safari over plain http:// (and iOS < 15.4), where
 * crypto.randomUUID is absent but crypto.getRandomValues is not.
 */
function withoutRandomUUID(): void {
  const { getRandomValues } = globalThis.crypto;
  vi.stubGlobal('crypto', {
    getRandomValues: getRandomValues.bind(globalThis.crypto),
  });
}

describe('newId', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(newId()).toMatch(V4);
  });

  it('still returns a valid v4 UUID without crypto.randomUUID', () => {
    withoutRandomUUID();
    expect((globalThis.crypto as Partial<Crypto>).randomUUID).toBeUndefined();
    expect(newId()).toMatch(V4);
  });

  it('does not collide across many calls in the fallback path', () => {
    withoutRandomUUID();
    const ids = new Set(Array.from({ length: 2000 }, () => newId()));
    expect(ids.size).toBe(2000);
  });

  it('degrades to a unique string when crypto is unusable', () => {
    vi.stubGlobal('crypto', {});
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
