import { describe, it, expect, afterEach } from 'vitest';
import { installReadableStreamAsyncIterator } from './streamsPolyfill';

/**
 * Simulates iOS Safari before 17.4, where ReadableStream is present but has no
 * [Symbol.asyncIterator]. pdf.js's getTextContent async-iterates the stream, so
 * without the polyfill the import dies with "undefined is not a function".
 */
function removeAsyncIterator(): PropertyDescriptor | undefined {
  const original = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
  Reflect.deleteProperty(ReadableStream.prototype, Symbol.asyncIterator);
  return original;
}

let saved: PropertyDescriptor | undefined;

afterEach(() => {
  Reflect.deleteProperty(ReadableStream.prototype, Symbol.asyncIterator);
  if (saved) Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, saved);
  saved = undefined;
});

function streamOf<T>(values: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const v of values) controller.enqueue(v);
      controller.close();
    },
  });
}

describe('installReadableStreamAsyncIterator', () => {
  it('restores for-await iteration when the engine lacks it', async () => {
    saved = removeAsyncIterator();
    expect(Symbol.asyncIterator in ReadableStream.prototype).toBe(false);

    installReadableStreamAsyncIterator();

    const seen: number[] = [];
    for await (const v of streamOf([1, 2, 3])) seen.push(v);
    expect(seen).toEqual([1, 2, 3]);
  });

  it('does not replace a native implementation', () => {
    const before = Object.getOwnPropertyDescriptor(
      ReadableStream.prototype,
      Symbol.asyncIterator,
    );
    installReadableStreamAsyncIterator();
    expect(Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator)).toEqual(
      before,
    );
  });

  it('releases the reader when the consumer breaks early', async () => {
    saved = removeAsyncIterator();
    installReadableStreamAsyncIterator();

    const stream = streamOf([1, 2, 3]);
    for await (const v of stream) {
      if (v === 2) break;
    }

    // A leaked lock would make this throw "already locked to a reader".
    expect(() => stream.getReader()).not.toThrow();
  });
});
