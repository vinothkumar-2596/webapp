/**
 * `ReadableStream` async-iteration polyfill.
 *
 * pdf.js v6 reads page text with, at pdf.mjs:22166:
 *
 *     for await (const value of readableStream)
 *
 * which requires `ReadableStream.prototype[Symbol.asyncIterator]`. That landed
 * in Safari 17.4, Chrome 124 and Firefox 117, so on iOS 17.3 and older it is
 * `undefined` and JavaScriptCore throws, mid-import:
 *
 *     TypeError: undefined is not a function (near '...e of t...')
 *
 * That is the real cause of the "This PDF cannot be read" reports.
 *
 * NOT covered by the `legacy/` build: core-js polyfills ECMAScript built-ins,
 * while async iteration of a ReadableStream is a WHATWG Streams feature, so no
 * pdf.js build ships it. `legacy/` is still required (see CLAUDE.md) — it is
 * necessary, not sufficient.
 *
 * Scope: the failing call is `PDFPageProxy.getTextContent`, which runs on the
 * main thread. Unlike the `Math.sumPrecise` case, a main-thread install is
 * therefore the correct and complete fix here.
 */

interface AsyncIterableStream {
  [Symbol.asyncIterator]?: unknown;
}

/** Idempotent; safe to call more than once and in any scope. */
export function installReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === 'undefined') return;

  const proto = ReadableStream.prototype as AsyncIterableStream;
  if (typeof proto[Symbol.asyncIterator] === 'function') return;

  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: function (this: ReadableStream<unknown>) {
      const reader = this.getReader();
      return {
        next: () => reader.read(),
        // Per spec the default iterator cancels the stream when the consumer
        // stops early; cancel can reject on an already-errored stream, which
        // must not mask the original failure.
        return: async (value?: unknown) => {
          try {
            await reader.cancel(value);
          } catch {
            /* stream already errored or closed */
          }
          reader.releaseLock();
          return { done: true, value };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  });
}
