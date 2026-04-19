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

  listen(canvas, "mousedown", (e) => dispatch({ type: AppEventType.MOUSE_DOWN, mouseX: e.offsetX * pixelRatio, mouseY: e.offsetY * pixelRatio, mouseButton: e.button }));
  listen(canvas, "mouseup", (e) => dispatch({ type: AppEventType.MOUSE_UP, mouseX: e.offsetX * pixelRatio, mouseY: e.offsetY * pixelRatio, mouseButton: e.button }));
  listen(canvas, "mousemove", (e) => dispatch({ type: AppEventType.MOUSE_MOVE, mouseX: e.offsetX * pixelRatio, mouseY: e.offsetY * pixelRatio, deltaX: e.movementX, deltaY: e.movementY }));
  listen(canvas, "wheel", (e) => { e.preventDefault(); dispatch({ type: AppEventType.MOUSE_WHEEL, deltaX: (e as WheelEvent).deltaX, deltaY: (e as WheelEvent).deltaY }); }, );
  listen(window, "keydown", (e) => dispatch({ type: AppEventType.KEY_DOWN, key: (e as KeyboardEvent).key, code: (e as KeyboardEvent).code }));
  listen(window, "keyup", (e) => dispatch({ type: AppEventType.KEY_UP, key: (e as KeyboardEvent).key, code: (e as KeyboardEvent).code }));

  listen(canvas, "touchstart", (e) => {
    e.preventDefault();
    dispatch({ type: AppEventType.TOUCH_START, touches: Array.from((e as TouchEvent).touches).map(t => ({ id: t.identifier, x: t.clientX * pixelRatio, y: t.clientY * pixelRatio })) });
  });
  listen(canvas, "touchmove", (e) => {
    e.preventDefault();
    dispatch({ type: AppEventType.TOUCH_MOVE, touches: Array.from((e as TouchEvent).touches).map(t => ({ id: t.identifier, x: t.clientX * pixelRatio, y: t.clientY * pixelRatio })) });
  });
  listen(canvas, "touchend", (e) => {
    dispatch({ type: AppEventType.TOUCH_END, touches: Array.from((e as TouchEvent).changedTouches).map(t => ({ id: t.identifier, x: t.clientX * pixelRatio, y: t.clientY * pixelRatio })) });
  });

  const resizeObserver = new ResizeObserver(() => {
    resize();
    dispatch({ type: AppEventType.RESIZE, width: canvas.width, height: canvas.height });
  });
  resizeObserver.observe(canvas);

  // Frame loop
  function frame() {
    if (!running) return;
    resize();
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
