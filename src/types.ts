// Resource handles — thin wrappers for type safety
export interface SgBuffer { readonly _brand: "SgBuffer"; readonly id: number }
export interface SgImage { readonly _brand: "SgImage"; readonly id: number }
export interface SgSampler { readonly _brand: "SgSampler"; readonly id: number }
export interface SgShader { readonly _brand: "SgShader"; readonly id: number }
export interface SgPipeline { readonly _brand: "SgPipeline"; readonly id: number }

export type Handle = SgBuffer | SgImage | SgSampler | SgShader | SgPipeline;

// Enums matching Sokol conventions

export enum VertexFormat {
  FLOAT2 = "float32x2",
  FLOAT3 = "float32x3",
  FLOAT4 = "float32x4",
  UBYTE4N = "unorm8x4",
}

export enum IndexType {
  NONE = 0,
  UINT16 = 1,
  UINT32 = 2,
}

export enum PrimitiveType {
  TRIANGLES = "triangle-list",
  TRIANGLE_STRIP = "triangle-strip",
  LINES = "line-list",
  LINE_STRIP = "line-strip",
  POINTS = "point-list",
}

export enum CullMode {
  NONE = "none",
  FRONT = "front",
  BACK = "back",
}

export enum CompareFunc {
  NEVER = "never",
  LESS = "less",
  EQUAL = "equal",
  LESS_EQUAL = "less-equal",
  GREATER = "greater",
  NOT_EQUAL = "not-equal",
  GREATER_EQUAL = "greater-equal",
  ALWAYS = "always",
}

export enum FilterMode {
  NEAREST = "nearest",
  LINEAR = "linear",
}

export enum WrapMode {
  REPEAT = "repeat",
  CLAMP = "clamp-to-edge",
  MIRROR = "mirror-repeat",
}

export enum PixelFormat {
  RGBA8 = "rgba8unorm",
  BGRA8 = "bgra8unorm",
  DEPTH24_STENCIL8 = "depth24plus-stencil8",
  DEPTH32F = "depth32float",
  R8 = "r8unorm",
  RG8 = "rg8unorm",
  RGBA16F = "rgba16float",
  RGBA32F = "rgba32float",
}

export enum LoadAction {
  CLEAR = 0,
  LOAD = 1,
  DONTCARE = 2,
}

export enum StoreAction {
  STORE   = 0,
  DISCARD = 1,
}

export enum BufferUsage {
  IMMUTABLE = 0,
  DYNAMIC   = 1,
  STREAM    = 2,
  INDIRECT  = 3,
}

// Desc structs — all fields optional, defaults applied at creation

export interface BufferDesc {
  usage?: BufferUsage;
  data?: ArrayBufferView;
  size?: number;
  label?: string;
}

export interface ImageDesc {
  width: number;
  height: number;
  format?: PixelFormat;
  data?: ArrayBufferView;
  renderTarget?: boolean;
  sampleCount?: 1 | 4;
  label?: string;
}

export interface SamplerDesc {
  minFilter?: FilterMode;
  magFilter?: FilterMode;
  mipmapFilter?: FilterMode;
  wrapU?: WrapMode;
  wrapV?: WrapMode;
  compare?: CompareFunc;
  /** Anisotropic filtering level. Valid range: 1–16, default 1.
   *  Values > 1 require minFilter, magFilter, and mipmapFilter to all be LINEAR;
   *  if they are not, maxAnisotropy is silently clamped to 1 (mirrors Sokol behaviour). */
  maxAnisotropy?: number;
  /** Minimum LOD clamp value (default 0). */
  lodMinClamp?: number;
  /** Maximum LOD clamp value (default 32). */
  lodMaxClamp?: number;
  label?: string;
}

export interface VertexAttrDesc {
  format: VertexFormat;
  shaderLocation: number;
  offset?: number;
  bufferIndex?: number;
}

export interface VertexBufferLayoutDesc {
  stride: number;
  stepMode?: GPUVertexStepMode;
}

export interface ShaderDesc {
  source?: string;           // combined VS+FS in one module (used for both stages)
  vertexSource?: string;     // used when source is absent
  fragmentSource?: string;   // used when source is absent
  vertexEntry?: string;      // default: "vs_main"
  fragmentEntry?: string;    // default: "fs_main"
  label?: string;
}

export interface ColorTargetDesc {
  format?: PixelFormat;
  blendEnabled?: boolean;
}

export interface DepthStencilDesc {
  format?: PixelFormat;
  depthWrite?: boolean;
  depthCompare?: CompareFunc;
}

export interface PipelineDesc {
  shader: SgShader;
  layout: {
    buffers: VertexBufferLayoutDesc[];
    attrs: VertexAttrDesc[];
  };
  primitive?: PrimitiveType;
  cullMode?: CullMode;
  indexType?: IndexType;
  colors?: ColorTargetDesc[];
  depth?: DepthStencilDesc;
  /** Number of texture bindings in bind group 1 (locations 0..images-1). Default 0. */
  images?: number;
  /** Number of sampler bindings in bind group 1 (locations images..images+samplerCount-1). Default 0. */
  samplerCount?: number;
  multisample?: { count?: 1 | 4 };
  label?: string;
}

export interface Bindings {
  vertexBuffers: SgBuffer[];
  indexBuffer?: SgBuffer;
  images?: SgImage[];
  samplers?: SgSampler[];
}

export interface ColorAttachment {
  action?: LoadAction;
  storeAction?: StoreAction;
  color?: [number, number, number, number];
  resolveImage?: SgImage;
}

export interface PassDesc {
  colorAttachments?: ColorAttachment[];
  depthAttachment?: {
    action?: LoadAction;
    storeAction?: StoreAction;
    value?: number;
  };
  /** Depth texture to use with the swapchain (non-offscreen) pass */
  swapchainDepthImage?: SgImage;
  // If omitted, renders to the swapchain
  offscreen?: {
    colorImages: SgImage[];
    depthImage?: SgImage;
  };
}

export interface AppDesc {
  canvas: HTMLCanvasElement | string;
  device?: GPUDevice;
  init: (gfx: Gfx) => void | Promise<void>;
  frame: (gfx: Gfx) => void;
  cleanup?: (gfx: Gfx) => void;
  event?: (ev: AppEvent, gfx: Gfx) => void;
  deviceLost?: (reason: GPUDeviceLostReason, message: string) => void;
  pixelRatio?: number;
  powerPreference?: "low-power" | "high-performance";
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, number>;
  /** Called just before cleanup during an HMR reload. Return any state to preserve across the reload. */
  serializeState?: (gfx: Gfx) => unknown;
  /** Called just after init during an HMR reload with the state returned by serializeState. */
  restoreState?: (state: unknown, gfx: Gfx) => void;
  dpiIndependentCoords?: boolean; // default false; when true all event coords are in CSS pixels
  onError?: (err: unknown) => boolean | void;
  preFrame?: (gfx: Gfx) => void;
  postFrame?: (gfx: Gfx) => void;
  targetFps?: number;
}

export type ShaderRecompileResult =
  | { ok: true; shader: SgShader }
  | { ok: false; vertexError?: string; fragmentError?: string };

export interface Gfx {
  makeBuffer(desc: BufferDesc): SgBuffer;
  makeImage(desc: ImageDesc): SgImage;
  makeSampler(desc: SamplerDesc): SgSampler;
  makeShader(desc: ShaderDesc): Promise<SgShader>;
  makePipeline(desc: PipelineDesc): SgPipeline;
  recompileShader(
    shd: SgShader,
    sources: { vertexSource?: string; fragmentSource?: string },
    callback?: (result: ShaderRecompileResult) => void,
  ): Promise<ShaderRecompileResult>;

  destroyBuffer(buf: SgBuffer): void;
  destroyImage(img: SgImage): void;
  destroySampler(smp: SgSampler): void;
  destroyShader(shd: SgShader): void;
  destroyPipeline(pip: SgPipeline): void;

  updateBuffer(buf: SgBuffer, data: ArrayBufferView): void;

  beginPass(desc?: PassDesc): void;
  applyPipeline(pip: SgPipeline): void;
  applyBindings(bind: Bindings): void;
  applyUniforms(data: ArrayBufferView): void;
  draw(baseElement: number, numElements?: number, numInstances?: number): void;
  drawIndirect(indirectBuffer: SgBuffer, indirectOffset?: number): void;
  endPass(): void;
  commit(): void;

  rebuildPipelinesForShader(shader: SgShader): Promise<void>;

  onPipelineRebuilt?: (pip: SgPipeline) => void;
  onPipelineRebuildError?: (pip: SgPipeline, error: unknown) => void;

  readonly canvas: HTMLCanvasElement;
  readonly device: GPUDevice;
  readonly width: number;
  readonly height: number;
  readonly cssWidth: number;   // canvas.clientWidth  (CSS pixels)
  readonly cssHeight: number;  // canvas.clientHeight (CSS pixels)
  readonly dpiScale: number;   // current effective pixelRatio
  readonly dt: number;
  readonly frameCount: number;
  readonly frameStats: DrawStats;
}

export interface DrawStats {
  drawCalls: number;
  totalElements: number;
  indirectDrawCalls: number;
}

// Audio types

export type AudioCallback = (
  buffer: Float32Array,
  numFrames: number,
  numChannels: number,
) => void;

export interface AudioDesc {
  sampleRate?: number;      // default: AudioContext default (~44100 or 48000)
  numChannels?: number;     // default: 2 (stereo)
  bufferFrames?: number;    // default: 128 (one AudioWorklet quantum)
  volume?: number;          // default: 1.0
  streamCallback: AudioCallback;
}

// Reserved for future multi-stream support; initial implementation uses one stream per Audio instance.
export interface SaudioStream { readonly _brand: "SaudioStream"; readonly id: number }

export interface Audio {
  readonly sampleRate: number;
  readonly numChannels: number;
  readonly isRunning: boolean;

  suspend(): Promise<void>;
  resume(): Promise<void>;
  setVolume(volume: number): void;
  shutdown(): void;
}

export interface AppEvent {
  type: AppEventType;
  key?: string;
  code?: string;
  mouseX?: number;
  mouseY?: number;
  mouseButton?: number;
  deltaX?: number;
  deltaY?: number;
  width?: number;
  height?: number;
  touches?: { id: number; x: number; y: number }[];
  gamepadIndex?: number;
  gamepadButtons?: boolean[];
  gamepadAxes?: number[];
}

export enum AppEventType {
  KEY_DOWN = "keydown",
  KEY_UP = "keyup",
  MOUSE_DOWN = "mousedown",
  MOUSE_UP = "mouseup",
  MOUSE_MOVE = "mousemove",
  MOUSE_WHEEL = "wheel",
  RESIZE = "resize",
  TOUCH_START = "touchstart",
  TOUCH_MOVE = "touchmove",
  TOUCH_END = "touchend",
  GAMEPAD_CONNECTED = "gamepadconnected",
  GAMEPAD_DISCONNECTED = "gamepaddisconnected",
  GAMEPAD_UPDATE = "gamepadupdate",
}
