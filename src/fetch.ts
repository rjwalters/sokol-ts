import {
  type Gfx,
  type FetchRequest,
  type FetchProgress,
  type FetchImageRequest,
  type FetchShaderRequest,
  type FetchSetupDesc,
  type SfetchContext,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function concatenateChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Compose two AbortSignals so that firing either one aborts the combined
 * signal.  Uses AbortSignal.any() when available (ES2023 browsers) and falls
 * back to a manual implementation for older environments.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return (AbortSignal as { any(signals: AbortSignal[]): AbortSignal }).any(signals);
  }
  // Polyfill: first already-aborted signal wins; otherwise wire up listeners.
  for (const s of signals) {
    if (s.aborted) {
      const ctrl = new AbortController();
      ctrl.abort(s.reason);
      return ctrl.signal;
    }
  }
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  for (const s of signals) {
    s.addEventListener("abort", onAbort, { once: true });
  }
  return ctrl.signal;
}

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------

class LRUCache<V> {
  private readonly map = new Map<string, V>();
  constructor(public readonly capacity: number) {}

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    // Refresh insertion order for LRU tracking.
    const val = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: string, value: V): void {
    if (this.capacity === 0) return;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // Evict the oldest (first) entry.
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }
}

// ---------------------------------------------------------------------------
// Internal queue entry
// ---------------------------------------------------------------------------

interface QueueEntry {
  url: string;
  req: FetchRequest<unknown>;
  internalController: AbortController;
}

// ---------------------------------------------------------------------------
// createSfetch
// ---------------------------------------------------------------------------

export function createSfetch(desc?: FetchSetupDesc): SfetchContext {
  const maxConcurrent = desc?.maxConcurrent ?? 6;
  const cacheCapacity = desc?.cacheCapacity ?? 0;

  const cache = new LRUCache<unknown>(cacheCapacity);
  const queue: QueueEntry[] = [];
  let inFlight = 0;
  let rootController = new AbortController();

  function pump(): void {
    while (inFlight < maxConcurrent && queue.length > 0) {
      // Sort descending by priority on each pump; Array.sort is stable.
      queue.sort((a, b) => (b.req.priority ?? 0) - (a.req.priority ?? 0));
      const entry = queue.shift()!;
      inFlight++;
      run(entry).finally(() => {
        inFlight--;
        pump();
      });
    }
  }

  async function run(entry: QueueEntry): Promise<void> {
    const { url, req, internalController } = entry;

    const signals: AbortSignal[] = [internalController.signal, rootController.signal];
    if (req.signal) signals.push(req.signal);
    const signal = signals.length === 1 ? signals[0] : anySignal(signals);

    try {
      let response: Response;
      try {
        response = await globalThis.fetch(url, { signal });
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} — ${url}`);
      }

      const contentLength = Number(response.headers.get("Content-Length") ?? 0);
      const body = response.body;

      let result: unknown;

      if (req.type === "image" && !req.onProgress) {
        // Fast path: decode directly from the response blob without streaming.
        const blob = await response.blob();
        result = await createImageBitmap(blob);
      } else {
        if (!body) throw new Error("Response body is null");

        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value.byteLength;
          chunks.push(value);
          if (req.onProgress) {
            const progress: FetchProgress = {
              loaded,
              total: contentLength,
              ratio: contentLength > 0 ? loaded / contentLength : 0,
            };
            req.onProgress(progress);
          }
        }

        switch (req.type) {
          case "arraybuffer":
            result = concatenateChunks(chunks).buffer as ArrayBuffer;
            break;
          case "text":
            result = new TextDecoder().decode(concatenateChunks(chunks));
            break;
          case "json":
            result = JSON.parse(new TextDecoder().decode(concatenateChunks(chunks))) as unknown;
            break;
          case "image":
            result = await createImageBitmap(new Blob(chunks as BlobPart[]));
            break;
        }
      }

      if (cacheCapacity > 0) {
        cache.set(url, result);
      }

      req.onDone(result, url);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (req.onError) {
        req.onError(error, url);
      }
    }
  }

  const ctx: SfetchContext = {
    fetch<T>(req: FetchRequest<T>): void {
      const url = req.url;

      // Cache hit: deliver synchronously (next microtask).
      if (cacheCapacity > 0) {
        const cached = cache.get(url);
        if (cached !== undefined) {
          Promise.resolve().then(() => req.onDone(cached as T, url));
          return;
        }
      }

      const internalController = new AbortController();
      queue.push({ url, req: req as FetchRequest<unknown>, internalController });
      pump();
    },

    fetchImage(gfx: Gfx, req: FetchImageRequest): void {
      ctx.fetch<ImageBitmap>({
        url: req.url,
        type: "image",
        signal: req.signal,
        onProgress: req.onProgress,
        onError: req.onError,
        onDone(bitmap, url) {
          const image = gfx.makeImage({
            width: bitmap.width,
            height: bitmap.height,
            label: req.label,
          });
          gfx.writeImageBitmap(image, bitmap);
          bitmap.close();
          req.onDone(image, url);
        },
      });
    },

    fetchShader(gfx: Gfx, req: FetchShaderRequest): void {
      ctx.fetch<string>({
        url: req.url,
        type: "text",
        signal: req.signal,
        onProgress: req.onProgress,
        onError: req.onError,
        onDone(source, url) {
          const shader = gfx.makeShader({
            vertexSource: source,
            fragmentSource: source,
            label: req.label,
          });
          req.onDone(shader, url);
        },
      });
    },

    batch(requests: FetchRequest<unknown>[], onAllDone: () => void): void {
      let remaining = requests.length;
      if (remaining === 0) {
        onAllDone();
        return;
      }
      for (const req of requests) {
        const originalDone = req.onDone;
        req.onDone = (result, url) => {
          originalDone(result, url);
          if (--remaining === 0) onAllDone();
        };
        ctx.fetch(req);
      }
    },

    clearCache(): void {
      cache.clear();
    },

    cancelAll(): void {
      rootController.abort();
      rootController = new AbortController();
      // Drain the pending queue — fire onError for each queued entry.
      const drained = queue.splice(0);
      for (const entry of drained) {
        if (entry.req.onError) {
          const err = new Error("Cancelled by cancelAll()");
          entry.req.onError(err, entry.url);
        }
      }
    },
  };

  return ctx;
}
