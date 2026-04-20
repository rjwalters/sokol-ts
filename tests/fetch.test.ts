/**
 * Tests for the fetch module: LRU cache behavior, anySignal polyfill,
 * and basic fetch lifecycle. Tests exercise internal LRU cache and
 * anySignal through the public createSfetch() API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSfetch } from "../src/fetch.js";

// ---------------------------------------------------------------------------
// Mock globalThis.fetch for testing
// ---------------------------------------------------------------------------

function mockFetchResponse(body: string, options?: { status?: number; headers?: Record<string, string> }) {
  const status = options?.status ?? 200;
  const headers = new Headers(options?.headers ?? {});
  const encoder = new TextEncoder();
  const encoded = encoder.encode(body);

  return new Response(new Blob([encoded]), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers,
  });
}

// ---------------------------------------------------------------------------
// LRU cache behavior (tested through createSfetch with cacheCapacity)
// ---------------------------------------------------------------------------

describe("LRU cache via createSfetch", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("delivers cached result on second fetch of same URL", async () => {
    let fetchCount = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCount++;
      return mockFetchResponse(JSON.stringify({ value: 42 }));
    });

    const sfetch = createSfetch({ cacheCapacity: 10 });

    // First fetch
    const result1 = await new Promise<unknown>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/data.json",
        type: "json",
        onDone: (data) => resolve(data),
        onError: (err) => reject(err),
      });
    });

    expect(fetchCount).toBe(1);
    expect(result1).toEqual({ value: 42 });

    // Second fetch of same URL should hit cache (no new network request)
    const result2 = await new Promise<unknown>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/data.json",
        type: "json",
        onDone: (data) => resolve(data),
        onError: (err) => reject(err),
      });
    });

    expect(fetchCount).toBe(1); // Still 1 -- cache hit
    expect(result2).toEqual({ value: 42 });
  });

  it("does not cache when cacheCapacity is 0", async () => {
    let fetchCount = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCount++;
      return mockFetchResponse(JSON.stringify({ value: 42 }));
    });

    const sfetch = createSfetch({ cacheCapacity: 0 });

    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/data.json",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(fetchCount).toBe(1);

    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/data.json",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(fetchCount).toBe(2); // No cache, so fetched again
  });

  it("evicts oldest entry when capacity is exceeded", async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      return mockFetchResponse(`"${url}"`);
    });

    const sfetch = createSfetch({ cacheCapacity: 2 });

    // Fetch 3 URLs to exceed capacity of 2
    for (const url of ["https://a.com", "https://b.com", "https://c.com"]) {
      await new Promise<void>((resolve, reject) => {
        sfetch.fetch({
          url,
          type: "json",
          onDone: () => resolve(),
          onError: (err) => reject(err),
        });
      });
    }

    expect(urls).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
    urls.length = 0;

    // "a.com" should have been evicted (oldest), so fetching it again triggers network
    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://a.com",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(urls).toEqual(["https://a.com"]);

    // "c.com" should still be cached (it was the most recent before re-fetching a)
    urls.length = 0;
    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://c.com",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(urls).toEqual([]); // cache hit, no fetch
  });

  it("LRU get refreshes insertion order", async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      return mockFetchResponse(`"${url}"`);
    });

    const sfetch = createSfetch({ cacheCapacity: 2 });

    // Fill cache with a and b
    for (const url of ["https://a.com", "https://b.com"]) {
      await new Promise<void>((resolve, reject) => {
        sfetch.fetch({
          url,
          type: "json",
          onDone: () => resolve(),
          onError: (err) => reject(err),
        });
      });
    }

    // Access "a.com" to refresh it (moves it to most-recently-used)
    urls.length = 0;
    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://a.com",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(urls).toEqual([]); // cache hit

    // Now add "c.com" -- should evict "b.com" (now oldest), not "a.com"
    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://c.com",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });

    // Verify "a.com" is still cached (it was refreshed, so it's not the oldest)
    urls.length = 0;
    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://a.com",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(urls).toEqual([]); // still cached

    // Verify "b.com" was evicted (fetch needed)
    urls.length = 0;
    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://b.com",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(urls).toEqual(["https://b.com"]); // evicted, had to re-fetch
  });

  it("clearCache invalidates all cached entries", async () => {
    let fetchCount = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCount++;
      return mockFetchResponse(JSON.stringify({ value: 1 }));
    });

    const sfetch = createSfetch({ cacheCapacity: 10 });

    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/data",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(fetchCount).toBe(1);

    sfetch.clearCache();

    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/data",
        type: "json",
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });
    expect(fetchCount).toBe(2); // Cache was cleared
  });
});

// ---------------------------------------------------------------------------
// anySignal / cancellation behavior
// ---------------------------------------------------------------------------

describe("fetch cancellation (anySignal)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("user-supplied AbortSignal cancels a fetch", async () => {
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      // Simulate checking the signal
      if (init?.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      // Simulate a delay before the signal fires
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
      return mockFetchResponse("should not reach");
    });

    const sfetch = createSfetch();
    const controller = new AbortController();

    const errorPromise = new Promise<Error>((resolve) => {
      sfetch.fetch({
        url: "https://example.com/slow",
        type: "text",
        signal: controller.signal,
        onDone: () => { throw new Error("should not resolve"); },
        onError: (err) => resolve(err),
      });
    });

    // Abort immediately
    controller.abort();

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it("cancelAll aborts all in-flight requests", async () => {
    let fetchAborted = false;
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          fetchAborted = true;
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
      return mockFetchResponse("should not reach");
    });

    const sfetch = createSfetch();

    const errorPromise = new Promise<Error>((resolve) => {
      sfetch.fetch({
        url: "https://example.com/cancelme",
        type: "text",
        onDone: () => { throw new Error("should not resolve"); },
        onError: (err) => resolve(err),
      });
    });

    sfetch.cancelAll();

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
    expect(fetchAborted).toBe(true);
  });

  it("cancelAll fires onError for queued (not-yet-started) entries", async () => {
    // Use maxConcurrent=1 to force queuing
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
      return mockFetchResponse("never");
    });

    const sfetch = createSfetch({ maxConcurrent: 1 });
    const errors: string[] = [];

    // First request goes in-flight
    sfetch.fetch({
      url: "https://example.com/1",
      type: "text",
      onDone: () => {},
      onError: (err) => errors.push(err.message),
    });

    // Second request is queued (maxConcurrent=1)
    sfetch.fetch({
      url: "https://example.com/2",
      type: "text",
      onDone: () => {},
      onError: (err) => errors.push(err.message),
    });

    sfetch.cancelAll();

    // The queued entry should have onError called synchronously with cancelAll
    // Wait a tick for in-flight abort to propagate
    await new Promise(r => setTimeout(r, 10));
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some(msg => msg.includes("Cancelled"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fetch type decoding
// ---------------------------------------------------------------------------

describe("fetch response type decoding", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("decodes text responses", async () => {
    globalThis.fetch = vi.fn(async () => mockFetchResponse("hello world"));

    const sfetch = createSfetch();
    const result = await new Promise<string>((resolve, reject) => {
      sfetch.fetch<string>({
        url: "https://example.com/text",
        type: "text",
        onDone: (data) => resolve(data),
        onError: (err) => reject(err),
      });
    });
    expect(result).toBe("hello world");
  });

  it("decodes JSON responses", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockFetchResponse(JSON.stringify({ key: "value", num: 42 }))
    );

    const sfetch = createSfetch();
    const result = await new Promise<{ key: string; num: number }>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/data.json",
        type: "json",
        onDone: (data) => resolve(data as { key: string; num: number }),
        onError: (err) => reject(err),
      });
    });
    expect(result).toEqual({ key: "value", num: 42 });
  });

  it("decodes arraybuffer responses", async () => {
    globalThis.fetch = vi.fn(async () => mockFetchResponse("ABCD"));

    const sfetch = createSfetch();
    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/binary",
        type: "arraybuffer",
        onDone: (data) => resolve(data as ArrayBuffer),
        onError: (err) => reject(err),
      });
    });
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("calls onError for HTTP error responses", async () => {
    globalThis.fetch = vi.fn(async () => mockFetchResponse("Not Found", { status: 404 }));

    const sfetch = createSfetch();
    const error = await new Promise<Error>((resolve) => {
      sfetch.fetch({
        url: "https://example.com/missing",
        type: "text",
        onDone: () => { throw new Error("should not resolve"); },
        onError: (err) => resolve(err),
      });
    });
    expect(error.message).toContain("404");
  });
});

// ---------------------------------------------------------------------------
// Progress callbacks
// ---------------------------------------------------------------------------

describe("fetch progress callbacks", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls onProgress during streaming download", async () => {
    const bodyText = "Hello, World!";
    const encoded = new TextEncoder().encode(bodyText);

    globalThis.fetch = vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoded);
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Length": String(encoded.byteLength) },
      });
    });

    const sfetch = createSfetch();
    const progressCalls: Array<{ loaded: number; total: number; ratio: number }> = [];

    await new Promise<void>((resolve, reject) => {
      sfetch.fetch({
        url: "https://example.com/data",
        type: "text",
        onProgress: (p) => progressCalls.push({ ...p }),
        onDone: () => resolve(),
        onError: (err) => reject(err),
      });
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    const last = progressCalls[progressCalls.length - 1];
    expect(last.loaded).toBe(encoded.byteLength);
    expect(last.ratio).toBeCloseTo(1.0);
  });
});

// ---------------------------------------------------------------------------
// Batch requests
// ---------------------------------------------------------------------------

describe("fetch batch", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls onAllDone after all requests complete", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return mockFetchResponse(`"${url}"`);
    });

    const sfetch = createSfetch();
    const results: string[] = [];

    await new Promise<void>((resolve) => {
      sfetch.batch(
        [
          {
            url: "https://example.com/1",
            type: "json",
            onDone: (data) => results.push(data as string),
          },
          {
            url: "https://example.com/2",
            type: "json",
            onDone: (data) => results.push(data as string),
          },
        ],
        () => resolve(),
      );
    });

    expect(results).toHaveLength(2);
    expect(results).toContain("https://example.com/1");
    expect(results).toContain("https://example.com/2");
  });

  it("calls onAllDone immediately for empty batch", async () => {
    const sfetch = createSfetch();
    let called = false;
    sfetch.batch([], () => { called = true; });
    expect(called).toBe(true);
  });
});
