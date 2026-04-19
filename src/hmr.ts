import type { AppDesc, Gfx } from "./types.js";
import { run } from "./app.js";

/**
 * Wraps run() with Vite HMR support. Call this instead of run() in your app
 * entry point to get live reloading without full page refreshes.
 *
 * When a module update is detected, the previous app instance is torn down
 * cleanly (stopping the frame loop, removing event listeners, destroying GPU
 * resources), and a new instance is started. The canvas element is preserved
 * across reloads.
 *
 * Optional serializeState / restoreState hooks on AppDesc allow apps to
 * preserve runtime state (e.g. camera position, simulation time) across
 * HMR cycles.
 *
 * @example
 * // main.ts
 * import { runWithHMR } from "sokol-ts";
 *
 * runWithHMR({
 *   canvas: "#canvas",
 *   init(gfx) { ... },
 *   frame(gfx) { ... },
 *   serializeState(gfx) { return { frameCount: gfx.frameCount }; },
 *   restoreState(state, gfx) { console.log("restored", state); },
 * });
 */

let _cleanup: (() => void) | null = null;
let _savedState: unknown = undefined;
let _currentDesc: AppDesc | null = null;

/**
 * runWithHMR wraps the AppDesc's init and cleanup to inject state
 * serialization/restoration around HMR cycles, then wires Vite hot.accept
 * and hot.dispose to drive the lifecycle slot.
 */
export async function runWithHMR(desc: AppDesc): Promise<void> {
  const state = _savedState;
  _savedState = undefined;

  await _mount(desc, state);

  const hot = getHot();
  if (!hot) return;

  hot.dispose(() => {
    // Serialize state (via the wrapped cleanup) then tear down
    if (_cleanup) {
      _cleanup();
      _cleanup = null;
    }
    _currentDesc = null;
    // _savedState was set by the wrapped cleanup callback; it survives into
    // the next module evaluation because it lives at module scope.
  });

  hot.accept((newModule: Record<string, unknown> | undefined) => {
    // If the incoming module exports __remount__, invoke it so it can
    // re-run with the latest desc referencing the new module closure.
    if (newModule && typeof newModule.__remount__ === "function") {
      (newModule.__remount__ as () => void)();
    }
  });
}

async function _mount(desc: AppDesc, savedState: unknown): Promise<void> {
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
  _currentDesc = desc;

  try {
    _cleanup = await run(_wrapDesc(desc, savedState));
  } catch (err) {
    _cleanup = null;
    _currentDesc = null;
    _showErrorOverlay(err);
  }
}

/**
 * Wraps init and cleanup callbacks to inject state round-tripping:
 * - restoreState is called after init when savedState is available
 * - serializeState is called inside the cleanup wrapper before teardown
 */
function _wrapDesc(desc: AppDesc, savedState: unknown): AppDesc {
  return {
    ...desc,

    async init(gfx: Gfx) {
      await desc.init(gfx);
      if (savedState !== undefined && desc.restoreState) {
        desc.restoreState(savedState, gfx);
      }
    },

    cleanup(gfx: Gfx) {
      if (desc.serializeState) {
        _savedState = desc.serializeState(gfx);
      }
      desc.cleanup?.(gfx);
    },
  };
}

/**
 * Display an error overlay using Vite's built-in mechanism when available,
 * falling back to a simple DOM overlay.
 */
function _showErrorOverlay(err: unknown): void {
  const hot = getHot();
  if (hot) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? "") : "";
    hot.send("vite:error", { err: { message, stack } });
  }

  // DOM fallback overlay
  const existing = document.getElementById("__sokol_hmr_error__");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "__sokol_hmr_error__";
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:99999",
    "background:rgba(0,0,0,0.85)", "color:#ff6b6b",
    "font-family:monospace", "font-size:14px",
    "padding:2rem", "white-space:pre-wrap", "overflow:auto",
  ].join(";");
  overlay.textContent = `[sokol-ts HMR] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
  document.body.appendChild(overlay);

  hot?.on("vite:afterUpdate", () => {
    document.getElementById("__sokol_hmr_error__")?.remove();
  });
}

function getHot(): ViteHot | undefined {
  return (import.meta as ImportMeta & { hot?: ViteHot }).hot;
}

// Minimal Vite HMR API surface — avoids a hard dependency on vite/client
interface ViteHot {
  accept(cb: (mod: Record<string, unknown> | undefined) => void): void;
  dispose(cb: () => void): void;
  send(event: string, data?: unknown): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

// Expose remount symbol for hot.accept consumers in the same module graph
export function __remount__(): void {
  if (_currentDesc) {
    _mount(_currentDesc, _savedState).catch(console.error);
  }
}
