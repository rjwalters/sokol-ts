import { type AppDesc, type AppEvent, AppEventType } from "./types.js";
import { createGfx } from "./gfx.js";

export async function run(desc: AppDesc): Promise<() => void> {
  const canvas = typeof desc.canvas === "string"
    ? document.querySelector<HTMLCanvasElement>(desc.canvas)!
    : desc.canvas;

  if (!canvas) throw new Error("Canvas not found");

  if (!navigator.gpu) {
    throw new Error("WebGPU is not supported in this browser");
  }

  const adapterOptions: GPURequestAdapterOptions = {};
  if (desc.powerPreference !== undefined) {
    adapterOptions.powerPreference = desc.powerPreference;
  }
  const adapter = await navigator.gpu.requestAdapter(adapterOptions);
  if (!adapter) throw new Error("Failed to get GPU adapter");

  const reqFeatures: GPUFeatureName[] = desc.requiredFeatures ?? [];
  const unsupported = reqFeatures.filter(f => !adapter.features.has(f));
  if (unsupported.length > 0) {
    throw new Error(`GPU adapter does not support required features: ${unsupported.join(", ")}`);
  }

  const device = await adapter.requestDevice({
    requiredFeatures: reqFeatures,
    requiredLimits: desc.requiredLimits,
  });
  const context = canvas.getContext("webgpu")!;
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format, alphaMode: "premultiplied" });

  let pixelRatio = desc.pixelRatio ?? window.devicePixelRatio;

  function resize() {
    const w = Math.floor(canvas.clientWidth * pixelRatio);
    const h = Math.floor(canvas.clientHeight * pixelRatio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // DPI change detection via matchMedia — re-registers on each change so we
  // always track the current ratio, regardless of how many monitors differ.
  let dpiMediaQuery: MediaQueryList | null = null;

  function onDpiChange() {
    if (desc.pixelRatio !== undefined) return; // honour fixed override
    pixelRatio = window.devicePixelRatio;
    resize();
    dispatch({
      type: AppEventType.RESIZE,
      width: desc.dpiIndependentCoords ? canvas.clientWidth : canvas.width,
      height: desc.dpiIndependentCoords ? canvas.clientHeight : canvas.height,
    });
    // Re-register for the next ratio change
    dpiMediaQuery = window.matchMedia(`(resolution: ${pixelRatio}dppx)`);
    dpiMediaQuery.addEventListener("change", onDpiChange, { once: true });
  }

  if (desc.pixelRatio === undefined) {
    dpiMediaQuery = window.matchMedia(`(resolution: ${pixelRatio}dppx)`);
    dpiMediaQuery.addEventListener("change", onDpiChange, { once: true });
  }

  resize();

  const gfx = createGfx(device, canvas, context, format);

  // Hoist running flag so the device.lost handler can reference it
  let running = true;

  // Attach device lost handler before init to avoid a race with async init
  device.lost.then((info) => {
    console.warn(`WebGPU device lost (reason: ${info.reason}): ${info.message}`);
    running = false;
    desc.deviceLost?.(info.reason, info.message);
  });

  await desc.init(gfx);

  // Input events
  function dispatch(ev: AppEvent) {
    desc.event?.(ev, gfx);
  }

  // coordScale: multiplier applied to mouse/touch coordinates.
  // When dpiIndependentCoords is true, coords are kept in CSS pixels (scale=1).
  // Otherwise coords are in physical pixels (scale=pixelRatio).
  const coordScale = () => desc.dpiIndependentCoords ? 1 : pixelRatio;

  // Convert a Touch to canvas-relative coordinates, correcting for canvas offset
  // in the viewport and scaling to the chosen coordinate space.
  function toCanvasTouch(t: Touch): { id: number; x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      id: t.identifier,
      x: (t.clientX - rect.left) * coordScale(),
      y: (t.clientY - rect.top)  * coordScale(),
    };
  }

  const eventMap: [EventTarget, string, (e: Event) => void][] = [];

  function listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
  ) {
    const h = handler as (e: Event) => void;
    target.addEventListener(type, h);
    eventMap.push([target, type, h]);
  }

  listen(canvas, "mousedown", (e) => dispatch({ type: AppEventType.MOUSE_DOWN, mouseX: e.offsetX * coordScale(), mouseY: e.offsetY * coordScale(), mouseButton: e.button }));
  listen(canvas, "mouseup", (e) => dispatch({ type: AppEventType.MOUSE_UP, mouseX: e.offsetX * coordScale(), mouseY: e.offsetY * coordScale(), mouseButton: e.button }));
  listen(canvas, "mousemove", (e) => dispatch({ type: AppEventType.MOUSE_MOVE, mouseX: e.offsetX * coordScale(), mouseY: e.offsetY * coordScale(), deltaX: e.movementX, deltaY: e.movementY }));
  listen(canvas, "wheel", (e) => { e.preventDefault(); dispatch({ type: AppEventType.MOUSE_WHEEL, deltaX: (e as WheelEvent).deltaX, deltaY: (e as WheelEvent).deltaY }); }, );
  listen(window, "keydown", (e) => dispatch({ type: AppEventType.KEY_DOWN, key: (e as KeyboardEvent).key, code: (e as KeyboardEvent).code }));
  listen(window, "keyup", (e) => dispatch({ type: AppEventType.KEY_UP, key: (e as KeyboardEvent).key, code: (e as KeyboardEvent).code }));

  listen(canvas, "touchstart", (e) => {
    e.preventDefault();
    dispatch({ type: AppEventType.TOUCH_START, touches: Array.from((e as TouchEvent).touches).map(toCanvasTouch) });
  });
  listen(canvas, "touchmove", (e) => {
    e.preventDefault();
    dispatch({ type: AppEventType.TOUCH_MOVE, touches: Array.from((e as TouchEvent).touches).map(toCanvasTouch) });
  });
  listen(canvas, "touchend", (e) => {
    dispatch({ type: AppEventType.TOUCH_END, touches: Array.from((e as TouchEvent).changedTouches).map(toCanvasTouch) });
  });

  const resizeObserver = new ResizeObserver(() => {
    resize();
    dispatch({
      type: AppEventType.RESIZE,
      width: desc.dpiIndependentCoords ? canvas.clientWidth : canvas.width,
      height: desc.dpiIndependentCoords ? canvas.clientHeight : canvas.height,
    });
  });
  resizeObserver.observe(canvas);

  // Frame loop
  let paused = false;

  const onVisibilityChange = () => {
    paused = document.hidden;
    if (!paused && running) requestAnimationFrame(frame);
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  eventMap.push([document, "visibilitychange", onVisibilityChange]);

  const targetInterval = desc.targetFps ? 1000 / desc.targetFps : 0;
  let lastFrameMs = 0;

  function frame(timestampMs: number) {
    if (!running || paused) return;
    if (targetInterval > 0 && timestampMs - lastFrameMs < targetInterval) {
      requestAnimationFrame(frame);
      return;
    }
    lastFrameMs = timestampMs;
    resize();
    desc.preFrame?.(gfx);
    try {
      desc.frame(gfx);
    } catch (err) {
      desc.postFrame?.(gfx);
      if (desc.onError) {
        desc.onError(err);
      } else {
        console.error("[sokol-ts] frame error:", err);
        running = false;
      }
      return;
    }
    desc.postFrame?.(gfx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Return cleanup function
  return () => {
    running = false;
    resizeObserver.disconnect();
    if (dpiMediaQuery) {
      dpiMediaQuery.removeEventListener("change", onDpiChange);
      dpiMediaQuery = null;
    }
    for (const [target, type, handler] of eventMap) {
      target.removeEventListener(type, handler);
    }
    desc.cleanup?.(gfx);
    device.destroy();
  };
}
