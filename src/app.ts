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

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("Failed to get GPU adapter");

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu")!;
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format, alphaMode: "premultiplied" });

  const pixelRatio = desc.pixelRatio ?? window.devicePixelRatio;

  function resize() {
    const w = Math.floor(canvas.clientWidth * pixelRatio);
    const h = Math.floor(canvas.clientHeight * pixelRatio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  resize();

  const gfx = createGfx(device, canvas, context, format);

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
    const mx = e.offsetX * pixelRatio;
    const my = e.offsetY * pixelRatio;
    if (desc.pointerLock) canvas.requestPointerLock();
    dispatch({ type: AppEventType.MOUSE_DOWN, mouseX: mx, mouseY: my, mouseButton: e.button, ...mouseNorm(mx, my) });
  });
  listen(canvas, "mouseup", (e) => {
    const mx = e.offsetX * pixelRatio;
    const my = e.offsetY * pixelRatio;
    dispatch({ type: AppEventType.MOUSE_UP, mouseX: mx, mouseY: my, mouseButton: e.button, ...mouseNorm(mx, my) });
  });
  listen(canvas, "mousemove", (e) => {
    const mx = e.offsetX * pixelRatio;
    const my = e.offsetY * pixelRatio;
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
  function touchPos(t: Touch): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (t.clientX - rect.left) * pixelRatio,
      y: (t.clientY - rect.top) * pixelRatio,
    };
  }

  listen(canvas, "touchstart", (e) => {
    e.preventDefault();
    dispatch({
      type: AppEventType.TOUCH_START,
      touches: Array.from((e as TouchEvent).touches).map(t => {
        const { x, y } = touchPos(t);
        return desc.normalizedCoords
          ? { id: t.identifier, x, y, normX: normX(x), normY: normY(y) }
          : { id: t.identifier, x, y };
      }),
    });
  });
  listen(canvas, "touchmove", (e) => {
    e.preventDefault();
    dispatch({
      type: AppEventType.TOUCH_MOVE,
      touches: Array.from((e as TouchEvent).touches).map(t => {
        const { x, y } = touchPos(t);
        return desc.normalizedCoords
          ? { id: t.identifier, x, y, normX: normX(x), normY: normY(y) }
          : { id: t.identifier, x, y };
      }),
    });
  });
  listen(canvas, "touchend", (e) => {
    dispatch({
      type: AppEventType.TOUCH_END,
      touches: Array.from((e as TouchEvent).changedTouches).map(t => {
        const { x, y } = touchPos(t);
        return desc.normalizedCoords
          ? { id: t.identifier, x, y, normX: normX(x), normY: normY(y) }
          : { id: t.identifier, x, y };
      }),
    });
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
    dispatch({ type: AppEventType.RESIZE, width: canvas.width, height: canvas.height });
  });
  resizeObserver.observe(canvas);

  // Frame loop
  let running = true;
  function frame() {
    if (!running) return;
    if (desc.eventQueue) flushEvents();
    resize();
    pollGamepads();
    desc.frame(gfx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Return cleanup function
  return () => {
    running = false;
    resizeObserver.disconnect();
    for (const [target, type, handler] of eventMap) {
      target.removeEventListener(type, handler);
    }
    desc.cleanup?.(gfx);
    device.destroy();
  };
}
