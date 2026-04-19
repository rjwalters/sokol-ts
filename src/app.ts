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

  const callerDevice = desc.device;
  const device = callerDevice ?? await (async () => {
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

    return adapter.requestDevice({
      requiredFeatures: reqFeatures,
      requiredLimits: desc.requiredLimits,
    });
  })();
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
  const eventQueue: AppEvent[] = [];

  function dispatch(ev: AppEvent) {
    if (desc.eventQueue) {
      eventQueue.push(ev);
    } else {
      desc.event?.(ev, gfx);
    }
  }

  function flushEvents() {
    const pending = eventQueue.splice(0);
    for (const ev of pending) desc.event?.(ev, gfx);
  }

  // Normalized coordinate helpers
  function normX(px: number) { return px / canvas.width; }
  function normY(py: number) { return py / canvas.height; }

  function mouseNorm(px: number, py: number): { mouseNormX?: number; mouseNormY?: number } {
    if (!desc.normalizedCoords) return {};
    return { mouseNormX: normX(px), mouseNormY: normY(py) };
  }

  // coordScale: multiplier applied to mouse/touch coordinates.
  // When dpiIndependentCoords is true, coords are kept in CSS pixels (scale=1).
  // Otherwise coords are in physical pixels (scale=pixelRatio).
  const coordScale = () => desc.dpiIndependentCoords ? 1 : pixelRatio;

  // Convert a Touch to canvas-relative coordinates, correcting for canvas offset
  // in the viewport and scaling to the chosen coordinate space.
  function toCanvasTouch(t: Touch): { id: number; x: number; y: number; normX?: number; normY?: number } {
    const rect = canvas.getBoundingClientRect();
    const x = (t.clientX - rect.left) * coordScale();
    const y = (t.clientY - rect.top)  * coordScale();
    return desc.normalizedCoords
      ? { id: t.identifier, x, y, normX: normX(x), normY: normY(y) }
      : { id: t.identifier, x, y };
  }

  const eventMap: [EventTarget, string, (e: Event) => void][] = [];

  function listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    handler: (e: HTMLElementEventMap[K]) => void,
  ): void;
  function listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
  ): void;
  function listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
  ) {
    target.addEventListener(type, handler);
    eventMap.push([target, type, handler]);
  }

  // Mouse events
  listen(canvas, "mousedown", (e) => {
    const mx = e.offsetX * coordScale();
    const my = e.offsetY * coordScale();
    if (desc.pointerLock) canvas.requestPointerLock();
    dispatch({ type: AppEventType.MOUSE_DOWN, mouseX: mx, mouseY: my, mouseButton: e.button, ...mouseNorm(mx, my) });
  });
  listen(canvas, "mouseup", (e) => {
    const mx = e.offsetX * coordScale();
    const my = e.offsetY * coordScale();
    dispatch({ type: AppEventType.MOUSE_UP, mouseX: mx, mouseY: my, mouseButton: e.button, ...mouseNorm(mx, my) });
  });
  listen(canvas, "mousemove", (e) => {
    const mx = e.offsetX * coordScale();
    const my = e.offsetY * coordScale();
    dispatch({ type: AppEventType.MOUSE_MOVE, mouseX: mx, mouseY: my, deltaX: e.movementX, deltaY: e.movementY, ...mouseNorm(mx, my) });
  });
  listen(canvas, "wheel", (e) => { e.preventDefault(); dispatch({ type: AppEventType.MOUSE_WHEEL, deltaX: (e as WheelEvent).deltaX, deltaY: (e as WheelEvent).deltaY }); }, );

  // Keyboard events
  listen(window, "keydown", (e) => dispatch({ type: AppEventType.KEY_DOWN, key: (e as KeyboardEvent).key, code: (e as KeyboardEvent).code, keyRepeat: (e as KeyboardEvent).repeat }));
  listen(window, "keyup", (e) => dispatch({ type: AppEventType.KEY_UP, key: (e as KeyboardEvent).key, code: (e as KeyboardEvent).code }));

  // Focus / blur events
  listen(window, "focus", () => dispatch({ type: AppEventType.FOCUS }));
  listen(window, "blur", () => dispatch({ type: AppEventType.BLUR }));

  // Touch events
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

  // Pointer lock events
  if (desc.pointerLock) {
    listen(document, "pointerlockchange", () => {
      const locked = document.pointerLockElement === canvas;
      dispatch({ type: locked ? AppEventType.POINTER_LOCK : AppEventType.POINTER_UNLOCK });
    });
    listen(document, "pointerlockerror", () => {
      dispatch({ type: AppEventType.POINTER_UNLOCK });
    });
  }

  // Drag and drop events (opt-in via desc.dragDrop)
  if (desc.dragDrop) {
    listen(canvas, "dragover", (e) => {
      e.preventDefault();
      dispatch({ type: AppEventType.DRAG_OVER });
    });
    listen(canvas, "dragleave", (e) => {
      void e;
      dispatch({ type: AppEventType.DRAG_LEAVE });
    });
    listen(canvas, "drop", (e) => {
      e.preventDefault();
      dispatch({ type: AppEventType.DROP, files: (e as DragEvent).dataTransfer?.files });
    });
  }

  // Gamepad connection events
  listen(window, "gamepadconnected", (e) => {
    dispatch({ type: AppEventType.GAMEPAD_CONNECTED, gamepadIndex: (e as GamepadEvent).gamepad.index });
  });
  listen(window, "gamepaddisconnected", (e) => {
    dispatch({ type: AppEventType.GAMEPAD_DISCONNECTED, gamepadIndex: (e as GamepadEvent).gamepad.index });
  });

  // Gamepad state tracking for per-frame polling
  const prevGamepadButtons: Map<number, boolean[]> = new Map();
  const prevGamepadAxes: Map<number, number[]> = new Map();

  function pollGamepads() {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp) continue;
      const idx = gp.index;

      // Button state diffing
      const prevButtons = prevGamepadButtons.get(idx) ?? [];
      for (let b = 0; b < gp.buttons.length; b++) {
        const pressed = gp.buttons[b].pressed;
        if (pressed !== prevButtons[b]) {
          dispatch({
            type: pressed ? AppEventType.GAMEPAD_DOWN : AppEventType.GAMEPAD_UP,
            gamepadIndex: idx,
            gamepadButton: b,
            gamepadValue: gp.buttons[b].value,
          });
        }
      }
      prevGamepadButtons.set(idx, gp.buttons.map(btn => btn.pressed));

      // Axis state diffing
      const prevAxes = prevGamepadAxes.get(idx) ?? [];
      for (let a = 0; a < gp.axes.length; a++) {
        const value = gp.axes[a];
        if (value !== prevAxes[a]) {
          dispatch({
            type: AppEventType.GAMEPAD_AXIS,
            gamepadIndex: idx,
            gamepadAxis: a,
            gamepadValue: value,
          });
        }
      }
      prevGamepadAxes.set(idx, Array.from(gp.axes));
    }
  }

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
    if (desc.eventQueue) flushEvents();
    resize();
    pollGamepads();
    desc.preFrame?.(gfx);
    try {
      desc.frame(gfx);
    } catch (err) {
      desc.postFrame?.(gfx);
      if (desc.onError) {
        if (desc.onError(err) === false) {
          running = false;
        } else {
          requestAnimationFrame(frame);
        }
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
    context.unconfigure();
    if (!callerDevice) device.destroy();
  };
}
