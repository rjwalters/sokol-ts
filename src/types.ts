/**
 * Core type definitions for sokol-ts.
 *
 * This module contains all public enums, interfaces, and type aliases used
 * throughout the library. Types follow Sokol conventions where applicable.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Resource handles -- thin wrappers for type safety
// ---------------------------------------------------------------------------

/** Opaque handle to a GPU buffer resource. */
export interface SgBuffer { readonly _brand: "SgBuffer"; readonly id: number }

/** Opaque handle to a GPU image (texture) resource. */
export interface SgImage { readonly _brand: "SgImage"; readonly id: number }

/** Opaque handle to a GPU sampler resource. */
export interface SgSampler { readonly _brand: "SgSampler"; readonly id: number }

/** Opaque handle to a compiled shader resource. */
export interface SgShader { readonly _brand: "SgShader"; readonly id: number }

/** Opaque handle to a render pipeline resource. */
export interface SgPipeline { readonly _brand: "SgPipeline"; readonly id: number }

/** Union of all GPU resource handle types. */
export type Handle = SgBuffer | SgImage | SgSampler | SgShader | SgPipeline;

// ---------------------------------------------------------------------------
// Enums matching Sokol conventions
// ---------------------------------------------------------------------------

/**
 * Vertex attribute formats.
 *
 * Maps to the corresponding WebGPU `GPUVertexFormat` strings.
 */
export enum VertexFormat {
  /** Two 32-bit floats (vec2f). */
  FLOAT2 = "float32x2",
  /** Three 32-bit floats (vec3f). */
  FLOAT3 = "float32x3",
  /** Four 32-bit floats (vec4f). */
  FLOAT4 = "float32x4",
  /** Four unsigned normalized 8-bit integers (unorm8x4). */
  UBYTE4N = "unorm8x4",
}

/**
 * Index buffer element type.
 *
 * Determines the byte width of each index element in an indexed draw call.
 */
export enum IndexType {
  /** No index buffer (non-indexed drawing). */
  NONE = 0,
  /** 16-bit unsigned integer indices (2 bytes per element). */
  UINT16 = 1,
  /** 32-bit unsigned integer indices (4 bytes per element). */
  UINT32 = 2,
}

/**
 * Primitive topology for rasterization.
 *
 * Maps to the corresponding WebGPU `GPUPrimitiveTopology` strings.
 */
export enum PrimitiveType {
  /** Every three vertices form a separate triangle. */
  TRIANGLES = "triangle-list",
  /** Vertices form a connected strip of triangles. */
  TRIANGLE_STRIP = "triangle-strip",
  /** Every two vertices form a separate line segment. */
  LINES = "line-list",
  /** Vertices form a connected strip of line segments. */
  LINE_STRIP = "line-strip",
  /** Each vertex is drawn as a single point. */
  POINTS = "point-list",
}

/**
 * Triangle face culling mode.
 *
 * Controls which triangle faces are discarded during rasterization.
 */
export enum CullMode {
  /** No face culling -- both front and back faces are rendered. */
  NONE = "none",
  /** Front-facing triangles are discarded. */
  FRONT = "front",
  /** Back-facing triangles are discarded. */
  BACK = "back",
}

/**
 * Depth/stencil comparison function.
 *
 * Used for depth testing and sampler comparison operations.
 */
export enum CompareFunc {
  /** Comparison never passes. */
  NEVER = "never",
  /** Passes if the incoming value is less than the stored value. */
  LESS = "less",
  /** Passes if the incoming value is equal to the stored value. */
  EQUAL = "equal",
  /** Passes if the incoming value is less than or equal to the stored value. */
  LESS_EQUAL = "less-equal",
  /** Passes if the incoming value is greater than the stored value. */
  GREATER = "greater",
  /** Passes if the incoming value is not equal to the stored value. */
  NOT_EQUAL = "not-equal",
  /** Passes if the incoming value is greater than or equal to the stored value. */
  GREATER_EQUAL = "greater-equal",
  /** Comparison always passes. */
  ALWAYS = "always",
}

/**
 * Texture sampling filter mode.
 *
 * Controls how texels are interpolated during sampling.
 */
export enum FilterMode {
  /** Nearest-neighbor filtering (no interpolation). */
  NEAREST = "nearest",
  /** Bilinear filtering (smooth interpolation between texels). */
  LINEAR = "linear",
}

/**
 * Texture coordinate wrapping mode.
 *
 * Controls how out-of-range texture coordinates are handled.
 */
export enum WrapMode {
  /** Texture coordinates wrap around (tile the texture). */
  REPEAT = "repeat",
  /** Texture coordinates are clamped to the edge texel. */
  CLAMP = "clamp-to-edge",
  /** Texture coordinates mirror at each integer boundary. */
  MIRROR = "mirror-repeat",
}

export enum BlendFactor {
  ZERO = "zero",
  ONE = "one",
  SRC_ALPHA = "src-alpha",
  ONE_MINUS_SRC_ALPHA = "one-minus-src-alpha",
  DST_ALPHA = "dst-alpha",
  ONE_MINUS_DST_ALPHA = "one-minus-dst-alpha",
  SRC_COLOR = "src",
  DST_COLOR = "dst",
  ONE_MINUS_SRC_COLOR = "one-minus-src",
  ONE_MINUS_DST_COLOR = "one-minus-dst",
  SRC_ALPHA_SATURATED = "src-alpha-saturated",
  CONSTANT = "constant",
  ONE_MINUS_CONSTANT = "one-minus-constant",
}

export enum BlendOp {
  ADD = "add",
  SUBTRACT = "subtract",
  REVERSE_SUBTRACT = "reverse-subtract",
  MIN = "min",
  MAX = "max",
}

export enum StencilOp {
  KEEP = "keep",
  ZERO = "zero",
  REPLACE = "replace",
  INVERT = "invert",
  INCREMENT_CLAMP = "increment-clamp",
  DECREMENT_CLAMP = "decrement-clamp",
  INCREMENT_WRAP = "increment-wrap",
  DECREMENT_WRAP = "decrement-wrap",
}

/**
 * Texture pixel formats.
 *
 * Maps to the corresponding WebGPU `GPUTextureFormat` strings.
 */
export enum PixelFormat {
  /** 8-bit RGBA unsigned normalized (4 bytes per pixel). */
  RGBA8 = "rgba8unorm",
  /** 8-bit BGRA unsigned normalized (4 bytes per pixel, preferred swapchain format on some platforms). */
  BGRA8 = "bgra8unorm",
  /** 24-bit depth + 8-bit stencil combined format. */
  DEPTH24_STENCIL8 = "depth24plus-stencil8",
  /** 32-bit floating-point depth format. */
  DEPTH32F = "depth32float",
  /** Single-channel 8-bit unsigned normalized. */
  R8 = "r8unorm",
  /** Two-channel 8-bit unsigned normalized. */
  RG8 = "rg8unorm",
  /** 16-bit RGBA half-float (8 bytes per pixel). */
  RGBA16F = "rgba16float",
  /** 32-bit RGBA float (16 bytes per pixel). */
  RGBA32F = "rgba32float",
  // Block-compressed formats (require device feature "texture-compression-*")
  BC1_RGBA = "bc1-rgba-unorm",
  BC3_RGBA = "bc3-rgba-unorm",
  BC4_R = "bc4-r-unorm",
  BC5_RG = "bc5-rg-unorm",
  BC6H_RGB = "bc6h-rgb-ufloat",
  BC7_RGBA = "bc7-rgba-unorm",
  ETC2_RGB8 = "etc2-rgb8unorm",
  ETC2_RGBA8 = "etc2-rgba8unorm",
  ASTC_4X4 = "astc-4x4-unorm",
  ASTC_8X8 = "astc-8x8-unorm",
}

/**
 * Render pass load action.
 *
 * Determines what happens to an attachment's contents at the start of a render pass.
 */
export enum LoadAction {
  /** Clear the attachment to a specified value. */
  CLEAR = 0,
  /** Preserve the existing contents of the attachment. */
  LOAD = 1,
  /** Contents are undefined -- the driver may optimize by not loading. */
  DONTCARE = 2,
}

/**
 * Render pass store action.
 *
 * Determines what happens to an attachment's contents at the end of a render pass.
 */
export enum StoreAction {
  /** Store the rendered contents to memory. */
  STORE   = 0,
  /** Discard the rendered contents (useful for transient attachments like MSAA resolve sources). */
  DISCARD = 1,
}

/**
 * GPU buffer usage hint.
 *
 * Informs the library how the buffer will be used, which affects internal GPU buffer flags.
 */
export enum BufferUsage {
  /** Buffer contents are set once at creation and never updated. */
  IMMUTABLE = 0,
  /** Buffer contents are updated infrequently (e.g. once per frame for a subset of buffers). */
  DYNAMIC   = 1,
  /** Buffer contents are updated every frame (streaming data). */
  STREAM    = 2,
  /** Buffer is used as an indirect draw argument source. */
  INDIRECT  = 3,
}

export type TextureDimension = "2d" | "3d" | "cube" | "cube-array";

// ---------------------------------------------------------------------------
// Desc structs -- all fields optional, defaults applied at creation
// ---------------------------------------------------------------------------

/** Descriptor for creating a GPU buffer via {@link Gfx.makeBuffer}. */
export interface BufferDesc {
  /** Buffer usage hint. Default: {@link BufferUsage.IMMUTABLE}. */
  usage?: BufferUsage;
  /** Initial data to upload. If provided, the buffer size is derived from this. */
  data?: ArrayBufferView;
  /** Buffer size in bytes. Used when `data` is not provided. Default: 256. */
  size?: number;
  /** Debug label for GPU debugging tools. */
  label?: string;
}

/** Descriptor for creating a GPU image (texture) via {@link Gfx.makeImage}. */
export interface ImageDesc {
  /** Texture width in texels. */
  width: number;
  /** Texture height in texels. */
  height: number;
  /** Depth for 3D textures (default 1). */
  depth?: number;
  /** Pixel format. Default: {@link PixelFormat.RGBA8}. */
  format?: PixelFormat;
  /** Initial pixel data to upload. */
  data?: ArrayBufferView;
  /** Whether this image can be used as a render target attachment. Default: false. */
  renderTarget?: boolean;
  /** MSAA sample count. Must be 1 (no MSAA) or 4. Default: 1. */
  sampleCount?: 1 | 4;
  /** Texture dimension: "2d" (default), "3d", or "cube". */
  dimension?: TextureDimension;
  /** Number of mipmaps. 0 = auto-generate full chain, 1 = no mipmaps (default). */
  numMipmaps?: number;
  /**
   * Number of array layers for 2D array textures (default 1).
   * Ignored for "cube" (always 6 layers).
   * For "cube-array", this is the number of cubes; the actual layer count
   * will be `numSlices * 6`.
   */
  numSlices?: number;
  /** Debug label for GPU debugging tools. */
  label?: string;
}

/** Descriptor for creating a GPU sampler via {@link Gfx.makeSampler}. */
export interface SamplerDesc {
  /** Minification filter. Default: {@link FilterMode.NEAREST}. */
  minFilter?: FilterMode;
  /** Magnification filter. Default: {@link FilterMode.NEAREST}. */
  magFilter?: FilterMode;
  /** Mipmap interpolation filter. Default: {@link FilterMode.NEAREST}. */
  mipmapFilter?: FilterMode;
  /** Horizontal (U-axis) wrap mode. Default: {@link WrapMode.REPEAT}. */
  wrapU?: WrapMode;
  /** Vertical (V-axis) wrap mode. Default: {@link WrapMode.REPEAT}. */
  wrapV?: WrapMode;
  /** Comparison function for comparison samplers (e.g. shadow maps). */
  compare?: CompareFunc;
  /**
   * Anisotropic filtering level. Valid range: 1--16, default 1.
   *
   * Values greater than 1 require `minFilter`, `magFilter`, and `mipmapFilter`
   * to all be {@link FilterMode.LINEAR}; if they are not, `maxAnisotropy` is
   * silently clamped to 1 (mirrors Sokol behaviour).
   */
  maxAnisotropy?: number;
  /** Minimum LOD clamp value. Default: 0. */
  lodMinClamp?: number;
  /** Maximum LOD clamp value. Default: 32. */
  lodMaxClamp?: number;
  /** Debug label for GPU debugging tools. */
  label?: string;
}

/** Describes a single vertex attribute within a vertex buffer layout. */
export interface VertexAttrDesc {
  /** Data format of this attribute. */
  format: VertexFormat;
  /** Shader location (e.g. `@location(N)` in WGSL). */
  shaderLocation: number;
  /** Byte offset of this attribute within the vertex. Default: 0. */
  offset?: number;
  /** Index into the `buffers` array that this attribute reads from. Default: 0. */
  bufferIndex?: number;
}

/** Describes the layout of a single vertex buffer. */
export interface VertexBufferLayoutDesc {
  /** Byte stride between consecutive vertices. */
  stride: number;
  /** Whether the buffer advances per-vertex or per-instance. Default: `"vertex"`. */
  stepMode?: GPUVertexStepMode;
}

/**
 * Descriptor for creating a shader via {@link Gfx.makeShader}.
 *
 * Provide either a combined `source` (used for both vertex and fragment stages)
 * or separate `vertexSource` and `fragmentSource`.
 */
export interface ShaderDesc {
  /** Combined WGSL source used for both vertex and fragment stages. */
  source?: string;
  /** Vertex stage WGSL source (used when `source` is absent). */
  vertexSource?: string;
  /** Fragment stage WGSL source (used when `source` is absent). */
  fragmentSource?: string;
  /** Vertex stage entry point function name. Default: `"vs_main"`. */
  vertexEntry?: string;
  /** Fragment stage entry point function name. Default: `"fs_main"`. */
  fragmentEntry?: string;
  /** Debug label for GPU debugging tools. */
  label?: string;
}

export interface BlendComponentDesc {
  srcFactor?: BlendFactor;
  dstFactor?: BlendFactor;
  operation?: BlendOp;
}

/** Describes a single color target in a pipeline. */
export interface ColorTargetDesc {
  /** Pixel format of the color target. Default: swapchain format. */
  format?: PixelFormat;
  /** Enable alpha blending on this target. Default: false. */
  blendEnabled?: boolean;
  colorBlend?: BlendComponentDesc;
  alphaBlend?: BlendComponentDesc;
  /** Bitmask of GPUColorWrite flags. Defaults to GPUColorWrite.ALL (0xF). */
  writeMask?: number;
}

export interface StencilFaceDesc {
  compare?: CompareFunc;
  failOp?: StencilOp;
  depthFailOp?: StencilOp;
  passOp?: StencilOp;
}

/** Describes the depth/stencil state for a pipeline. */
export interface DepthStencilDesc {
  /** Depth buffer pixel format. Default: {@link PixelFormat.DEPTH24_STENCIL8}. */
  format?: PixelFormat;
  /** Whether the pipeline writes to the depth buffer. Default: true. */
  depthWrite?: boolean;
  /** Depth comparison function. Default: {@link CompareFunc.LESS}. */
  depthCompare?: CompareFunc;
  stencilFront?: StencilFaceDesc;
  stencilBack?: StencilFaceDesc;
  /** Default 0xFF */
  stencilReadMask?: number;
  /** Default 0xFF */
  stencilWriteMask?: number;
}

export interface MsaaDesc {
  /** Sample count. Must be 1 or 4 in WebGPU (implementations may support 2, 8, 16). Default: 4. */
  count?: 1 | 2 | 4 | 8 | 16;
  alphaToCoverage?: boolean;
}

/** Descriptor for creating a render pipeline via {@link Gfx.makePipeline}. */
export interface PipelineDesc {
  /** Shader to use for this pipeline. */
  shader: SgShader;
  /** Vertex input layout. */
  layout: {
    /** Per-buffer layout descriptions. */
    buffers: VertexBufferLayoutDesc[];
    /** Vertex attribute descriptions. */
    attrs: VertexAttrDesc[];
  };
  /** Primitive topology. Default: {@link PrimitiveType.TRIANGLES}. */
  primitive?: PrimitiveType;
  /** Triangle face culling mode. Default: {@link CullMode.NONE}. */
  cullMode?: CullMode;
  /** Index buffer element type. Default: {@link IndexType.NONE}. */
  indexType?: IndexType;
  /** Color target configurations. Default: one target with swapchain format. */
  colors?: ColorTargetDesc[];
  /** Depth/stencil configuration. Omit to disable depth testing. */
  depth?: DepthStencilDesc;
  /** Number of texture bindings in bind group 1 (locations 0..images-1). Default: 0. */
  images?: number;
  /**
   * View dimension for each texture binding in bind group 1.
   * When provided, `imageViewDimensions[i]` sets the `viewDimension` on the
   * bind group layout entry for image slot `i`. Slots beyond the array length
   * (or when omitted entirely) default to `"2d"`.
   *
   * Must be set for cube / cube-array textures; otherwise the layout defaults
   * to `"2d"` and `createBindGroup` will fail at runtime.
   */
  imageViewDimensions?: GPUTextureViewDimension[];
  /** Number of sampler bindings in bind group 1 (locations images..images+samplerCount-1). Default: 0. */
  samplerCount?: number;
  /** MSAA multisample configuration. */
  multisample?: MsaaDesc;
  /** Debug label for GPU debugging tools. */
  label?: string;
}

/** Resource bindings applied per draw call via {@link Gfx.applyBindings}. */
export interface Bindings {
  /** Vertex buffers to bind (one per buffer slot in the pipeline layout). */
  vertexBuffers: SgBuffer[];
  /** Index buffer to bind. Required for indexed drawing. */
  indexBuffer?: SgBuffer;
  /** Texture images to bind in bind group 1 (locations 0..N-1). */
  images?: SgImage[];
  /** Samplers to bind in bind group 1 (locations N..N+M-1, after images). */
  samplers?: SgSampler[];
}

/** Describes a single color attachment for a render pass. */
export interface ColorAttachment {
  /** Load action at pass start. Default: {@link LoadAction.CLEAR}. */
  action?: LoadAction;
  /** Store action at pass end. Default: {@link StoreAction.STORE}. */
  storeAction?: StoreAction;
  /** Clear color as `[r, g, b, a]` in the 0--1 range. Default: `[0, 0, 0, 1]`. */
  color?: [number, number, number, number];
  /** MSAA resolve target image. */
  resolveImage?: SgImage;
}

/** Descriptor for beginning a render pass via {@link Gfx.beginPass}. */
export interface PassDesc {
  /** Color attachment configurations. */
  colorAttachments?: ColorAttachment[];
  /** Depth/stencil attachment configuration. */
  depthAttachment?: {
    /** Load action at pass start. Default: {@link LoadAction.CLEAR}. */
    action?: LoadAction;
    /** Store action at pass end. Default: {@link StoreAction.STORE}. */
    storeAction?: StoreAction;
    /** Depth clear value. Default: 1.0. */
    value?: number;
  };
  /** Depth texture to use with the swapchain (non-offscreen) pass. */
  swapchainDepthImage?: SgImage;
  /** Offscreen render target configuration. If omitted, renders to the swapchain. */
  offscreen?: {
    /** Color images to render into. */
    colorImages: SgImage[];
    /** Depth image to render into. */
    depthImage?: SgImage;
    /** Resolve targets for MSAA color images (one per colorImage). */
    resolveImages?: SgImage[];
  };
}

/**
 * Application descriptor passed to {@link run} to configure the render loop.
 *
 * At minimum, `canvas`, `init`, and `frame` must be provided.
 */
export interface AppDesc {
  /** Canvas element or CSS selector string (e.g. `"#my-canvas"`). */
  canvas: HTMLCanvasElement | string;
  /** Optional pre-created `GPUDevice`. If omitted, one is requested automatically. */
  device?: GPUDevice;
  /**
   * Called once after the GPU device is ready. Use this to create shaders,
   * pipelines, buffers, and other resources.
   */
  init: (gfx: Gfx) => void | Promise<void>;
  /** Called once per frame. Issue draw commands here. */
  frame: (gfx: Gfx) => void;
  /** Called when the application is torn down. Release resources here. */
  cleanup?: (gfx: Gfx) => void;
  /** Called for input events (keyboard, mouse, touch, resize). */
  event?: (ev: AppEvent, gfx: Gfx) => void;
  /** Called when the WebGPU device is lost (e.g. GPU reset, driver crash). */
  deviceLost?: (reason: GPUDeviceLostReason, message: string) => void;
  /** Fixed device pixel ratio override. Default: `window.devicePixelRatio`. */
  pixelRatio?: number;
  normalizedCoords?: boolean;
  pointerLock?: boolean;
  eventQueue?: boolean;
  dragDrop?: boolean;
  /** GPU power preference hint. */
  powerPreference?: "low-power" | "high-performance";
  /** Required WebGPU features. Adapter request fails if any are unsupported. */
  requiredFeatures?: GPUFeatureName[];
  /** Required WebGPU limits. */
  requiredLimits?: Record<string, number>;
  /** Called just before cleanup during an HMR reload. Return any state to preserve across the reload. */
  serializeState?: (gfx: Gfx) => unknown;
  /** Called just after init during an HMR reload with the state returned by `serializeState`. */
  restoreState?: (state: unknown, gfx: Gfx) => void;
  /**
   * When true, all event coordinates are reported in CSS pixels instead of
   * physical (device) pixels. Default: false.
   */
  dpiIndependentCoords?: boolean;
  /**
   * Custom error handler for frame errors. Return `false` to stop the frame loop;
   * return anything else (or void) to continue. If not provided, errors are logged
   * and the loop stops.
   */
  onError?: (err: unknown) => boolean | void;
  /** Hook called before each frame callback. */
  preFrame?: (gfx: Gfx) => void;
  /** Hook called after each frame callback. */
  postFrame?: (gfx: Gfx) => void;
  /** Target frames per second. When set, frame callbacks are throttled to this rate. */
  targetFps?: number;
}

/**
 * Result of a shader recompilation attempt via {@link Gfx.recompileShader}.
 *
 * On success, contains the updated shader handle. On failure, contains
 * per-stage error messages.
 */
export type ShaderRecompileResult =
  | { ok: true; shader: SgShader }
  | { ok: false; vertexError?: string; fragmentError?: string };

/**
 * The main graphics context. Provides methods for creating and managing GPU
 * resources, recording render passes, and issuing draw commands.
 *
 * Obtained via the `init` callback in {@link AppDesc} or by calling
 * {@link createGfx} directly.
 */
export interface Gfx {
  /**
   * Create a GPU buffer.
   * @param desc - Buffer descriptor.
   * @returns An opaque buffer handle.
   */
  makeBuffer(desc: BufferDesc): SgBuffer;

  /**
   * Create a GPU image (texture).
   * @param desc - Image descriptor.
   * @returns An opaque image handle.
   */
  makeImage(desc: ImageDesc): SgImage;

  /**
   * Create a GPU sampler.
   * @param desc - Sampler descriptor.
   * @returns An opaque sampler handle.
   */
  makeSampler(desc: SamplerDesc): SgSampler;

  /**
   * Compile WGSL source and create a shader.
   *
   * Throws if compilation produces errors.
   *
   * @param desc - Shader descriptor with WGSL source.
   * @returns An opaque shader handle.
   */
  makeShader(desc: ShaderDesc): Promise<SgShader>;

  /**
   * Create a render pipeline.
   * @param desc - Pipeline descriptor.
   * @returns An opaque pipeline handle.
   */
  makePipeline(desc: PipelineDesc): SgPipeline;

  /**
   * Hot-recompile a shader with new source code.
   *
   * On success the shader's GPU modules are atomically swapped; dependent
   * pipelines must be rebuilt separately via {@link rebuildPipelinesForShader}.
   *
   * @param shd - Existing shader handle to recompile.
   * @param sources - New vertex and/or fragment WGSL source.
   * @param callback - Optional callback invoked with the result.
   * @returns The recompilation result.
   */
  recompileShader(
    shd: SgShader,
    sources: { vertexSource?: string; fragmentSource?: string },
    callback?: (result: ShaderRecompileResult) => void,
  ): Promise<ShaderRecompileResult>;

  /**
   * Destroy a buffer and release its GPU memory.
   * @param buf - Buffer handle to destroy.
   */
  destroyBuffer(buf: SgBuffer): void;

  /**
   * Destroy an image and release its GPU memory.
   * @param img - Image handle to destroy.
   */
  destroyImage(img: SgImage): void;

  /**
   * Destroy a sampler.
   * @param smp - Sampler handle to destroy.
   */
  destroySampler(smp: SgSampler): void;

  /**
   * Destroy a shader.
   * @param shd - Shader handle to destroy.
   */
  destroyShader(shd: SgShader): void;

  /**
   * Destroy a pipeline and remove its shader dependency tracking.
   * @param pip - Pipeline handle to destroy.
   */
  destroyPipeline(pip: SgPipeline): void;

  /**
   * Check whether a resource handle is still valid (not destroyed).
   * @param handle - Any GPU resource handle.
   * @returns `true` if the handle refers to a live resource.
   */
  isValid(handle: Handle): boolean;

  /**
   * Upload new data to an existing buffer.
   * @param buf - Target buffer handle.
   * @param data - Data to upload.
   * @param dstOffset - Optional byte offset into the destination buffer.
   */
  updateBuffer(buf: SgBuffer, data: ArrayBufferView, dstOffset?: number): void;

  /**
   * Upload new data to an existing image (texture).
   * @param img - Target image handle.
   * @param data - Pixel data to upload.
   * @param mipLevel - Mip level to write to. Default: 0.
   * @param arrayLayer - Array layer to write to. Default: 0.
   */
  updateImage(img: SgImage, data: ArrayBufferView, mipLevel?: number, arrayLayer?: number): void;
  writeImageBitmap(img: SgImage, bitmap: ImageBitmap): void;

  /**
   * Begin a render pass.
   *
   * If `desc` is omitted, renders to the swapchain with default clear values.
   * Multiple passes per frame are supported (the command encoder is shared).
   *
   * @param desc - Optional pass descriptor for offscreen or custom clear.
   */
  beginPass(desc?: PassDesc): void;

  /**
   * Set the active render pipeline for subsequent draw commands.
   * @param pip - Pipeline handle to bind.
   */
  applyPipeline(pip: SgPipeline): void;

  /**
   * Bind vertex/index buffers and texture/sampler resources.
   * @param bind - Resource bindings.
   */
  applyBindings(bind: Bindings): void;

  /**
   * Upload uniform data for the current draw call.
   *
   * Data is written to a shared 64 KB uniform staging buffer with 256-byte
   * alignment (WebGPU requirement for dynamic offsets).
   *
   * @param data - Uniform data to upload.
   */
  applyUniforms(data: ArrayBufferView): void;

  /**
   * Set the stencil reference value for subsequent draw commands.
   * @param ref - The stencil reference value.
   */
  applyStencilRef(ref: number): void;

  /**
   * Issue a draw call.
   *
   * Automatically selects indexed or non-indexed drawing based on the active
   * pipeline's index type. When `numElements` is omitted or zero, the count
   * is auto-derived from the bound buffer sizes.
   *
   * @param baseElement - First vertex or index to draw.
   * @param numElements - Number of vertices or indices. Auto-derived if omitted.
   * @param numInstances - Number of instances. Default: 1.
   */
  draw(baseElement: number, numElements?: number, numInstances?: number): void;

  /**
   * Issue an indirect draw call.
   *
   * The indirect buffer must contain a `GPUDrawIndirectArgs` or
   * `GPUDrawIndexedIndirectArgs` struct depending on the active pipeline's
   * index type.
   *
   * @param indirectBuffer - Buffer containing indirect draw arguments.
   * @param indirectOffset - Byte offset into the indirect buffer. Default: 0.
   */
  drawIndirect(indirectBuffer: SgBuffer, indirectOffset?: number): void;

  /** End the current render pass. Safe to call when no pass is active. */
  endPass(): void;

  /**
   * Submit all recorded commands to the GPU queue and advance frame timing.
   *
   * Must be called once at the end of each frame, after all passes are ended.
   */
  commit(): void;
  shutdown(): void;

  /**
   * Rebuild all pipelines that depend on the given shader.
   *
   * Call this after a successful {@link recompileShader} to apply the new
   * shader modules to all dependent pipelines.
   *
   * @param shader - Shader whose dependent pipelines should be rebuilt.
   */
  rebuildPipelinesForShader(shader: SgShader): Promise<void>;

  /**
   * Optional callback invoked when a pipeline is successfully rebuilt
   * during hot-reload.
   */
  onPipelineRebuilt?: (pip: SgPipeline) => void;

  /**
   * Optional callback invoked when a pipeline rebuild fails during hot-reload.
   * The old pipeline remains in use.
   */
  onPipelineRebuildError?: (pip: SgPipeline, error: unknown) => void;

  /** The HTML canvas element this graphics context renders to. */
  readonly canvas: HTMLCanvasElement;

  /** The underlying WebGPU device. */
  readonly device: GPUDevice;

  /** Canvas width in physical (device) pixels. */
  readonly width: number;

  /** Canvas height in physical (device) pixels. */
  readonly height: number;

  /** Canvas width in CSS pixels (`canvas.clientWidth`). */
  readonly cssWidth: number;

  /** Canvas height in CSS pixels (`canvas.clientHeight`). */
  readonly cssHeight: number;

  /** Current effective device pixel ratio. */
  readonly dpiScale: number;

  /** Time elapsed since the previous frame, in seconds. */
  readonly dt: number;

  /** Total number of frames rendered since initialization. */
  readonly frameCount: number;

  /** Per-frame draw call statistics (snapshot; returns a copy). */
  readonly frameStats: DrawStats;
}

/** Per-frame rendering statistics returned by {@link Gfx.frameStats}. */
export interface DrawStats {
  /** Number of direct draw calls issued this frame. */
  drawCalls: number;
  /** Total number of vertices/indices processed across all draw calls. */
  totalElements: number;
  /** Number of indirect draw calls issued this frame. */
  indirectDrawCalls: number;
}

// ---------------------------------------------------------------------------
// Audio types
// ---------------------------------------------------------------------------

/**
 * Audio stream callback function signature.
 *
 * Called by the audio worklet to fill an interleaved sample buffer.
 * Samples are interleaved: `[L0, R0, L1, R1, ...]` for stereo.
 *
 * @param buffer - Interleaved output buffer to fill with samples.
 * @param numFrames - Number of audio frames to generate.
 * @param numChannels - Number of channels (e.g. 2 for stereo).
 */
export type AudioCallback = (
  buffer: Float32Array,
  numFrames: number,
  numChannels: number,
) => void;

/** Descriptor for creating an audio context via {@link createAudio}. */
export interface AudioDesc {
  /** Sample rate in Hz. Default: AudioContext default (typically 44100 or 48000). */
  sampleRate?: number;
  /** Number of output channels. Default: 2 (stereo). */
  numChannels?: number;
  /** Audio buffer size in frames per quantum. Default: 128 (one AudioWorklet quantum). */
  bufferFrames?: number;
  /** Master volume multiplier. Default: 1.0. */
  volume?: number;
  /** Callback that fills the interleaved audio buffer each quantum. */
  streamCallback: AudioCallback;
}

/**
 * Reserved handle for future multi-stream audio support.
 *
 * Currently unused; the initial implementation uses one stream per Audio instance.
 */
export interface SaudioStream { readonly _brand: "SaudioStream"; readonly id: number }

/**
 * Audio playback context returned by {@link createAudio}.
 *
 * Manages an AudioWorklet-based audio pipeline with automatic
 * suspend/resume on page visibility changes.
 */
export interface Audio {
  /** The actual sample rate of the audio context (in Hz). */
  readonly sampleRate: number;
  /** Number of output channels. */
  readonly numChannels: number;
  /** Whether the audio context is currently running (not suspended or closed). */
  readonly isRunning: boolean;

  /** Suspend audio playback. The context can be resumed later. */
  suspend(): Promise<void>;
  /** Resume audio playback after suspension. Throws if called after {@link shutdown}. */
  resume(): Promise<void>;
  /**
   * Set the master output volume.
   * @param volume - Volume multiplier (0.0 = silent, 1.0 = full volume).
   */
  setVolume(volume: number): void;
  /** Permanently shut down the audio context and release all resources. */
  shutdown(): void;
}

// ---------------------------------------------------------------------------
// Input event types
// ---------------------------------------------------------------------------

// ---- sfetch types ----

export type FetchResponseType = "arraybuffer" | "text" | "json" | "image";

export interface FetchProgress {
  loaded: number;   // bytes received so far
  total: number;    // Content-Length, or 0 if unknown
  ratio: number;    // loaded/total, or 0 if unknown
}

export interface FetchRequest<T> {
  url: string;
  type: FetchResponseType;
  priority?: number;           // higher = fetched first; default 0
  signal?: AbortSignal;        // caller-supplied AbortController.signal
  onProgress?: (p: FetchProgress) => void;
  onDone: (result: T, url: string) => void;
  onError?: (err: Error, url: string) => void;
}

export interface FetchImageRequest {
  url: string;
  signal?: AbortSignal;
  onProgress?: (p: FetchProgress) => void;
  onDone: (image: SgImage, url: string) => void;
  onError?: (err: Error, url: string) => void;
  label?: string;
}

/** Base fields shared by both single-URL and split-URL shader requests. */
interface FetchShaderRequestBase {
  signal?: AbortSignal;
  onProgress?: (p: FetchProgress) => void;
  onDone: (shader: SgShader, url: string) => void;
  onError?: (err: Error, url: string) => void;
  label?: string;
}

/** Single combined WGSL file (used for both vertex and fragment stages). */
export interface FetchShaderSingleRequest extends FetchShaderRequestBase {
  url: string;
  vertexUrl?: undefined;
  fragmentUrl?: undefined;
}

/** Separate vertex and fragment WGSL files, fetched in parallel. */
export interface FetchShaderSplitRequest extends FetchShaderRequestBase {
  url?: undefined;
  vertexUrl: string;
  fragmentUrl: string;
}

export type FetchShaderRequest = FetchShaderSingleRequest | FetchShaderSplitRequest;

export interface FetchSetupDesc {
  maxConcurrent?: number;   // default 6, mirrors browser connection limits
  cacheCapacity?: number;   // max number of cached responses; 0 = no cache
}

export interface SfetchContext {
  fetch<T>(req: FetchRequest<T>): void;
  fetchImage(gfx: Gfx, req: FetchImageRequest): void;
  fetchShader(gfx: Gfx, req: FetchShaderRequest): void;
  batch(requests: FetchRequest<unknown>[], onAllDone: () => void): void;
  clearCache(): void;
  cancelAll(): void;
}

/** Application input event delivered via the {@link AppDesc.event} callback. */
export interface AppEvent {
  /** The type of event. */
  type: AppEventType;
  /** Keyboard key value (e.g. `"a"`, `"Enter"`). Present for key events. */
  key?: string;
  /** Keyboard key code (e.g. `"KeyA"`, `"Space"`). Present for key events. */
  code?: string;
  keyRepeat?: boolean;
  /** Mouse X coordinate (CSS or physical pixels depending on `dpiIndependentCoords`). */
  mouseX?: number;
  /** Mouse Y coordinate (CSS or physical pixels depending on `dpiIndependentCoords`). */
  mouseY?: number;
  /** Mouse button index (0 = left, 1 = middle, 2 = right). */
  mouseButton?: number;
  mouseNormX?: number;
  mouseNormY?: number;
  /** Horizontal scroll/movement delta. */
  deltaX?: number;
  /** Vertical scroll/movement delta. */
  deltaY?: number;
  /** New canvas width (present for resize events). */
  width?: number;
  /** New canvas height (present for resize events). */
  height?: number;
  /** Active touch points (present for touch events). */
  touches?: { id: number; x: number; y: number; normX?: number; normY?: number }[];
  gamepadIndex?: number;
  gamepadButton?: number;
  gamepadAxis?: number;
  gamepadValue?: number;
  files?: FileList;
}

/**
 * Application event types.
 *
 * Maps to DOM event type strings for keyboard, mouse, touch, and resize events.
 */
export enum AppEventType {
  /** A key was pressed down. */
  KEY_DOWN = "keydown",
  /** A key was released. */
  KEY_UP = "keyup",
  /** A mouse button was pressed. */
  MOUSE_DOWN = "mousedown",
  /** A mouse button was released. */
  MOUSE_UP = "mouseup",
  /** The mouse was moved. */
  MOUSE_MOVE = "mousemove",
  /** The mouse wheel was scrolled. */
  MOUSE_WHEEL = "wheel",
  /** The canvas was resized. */
  RESIZE = "resize",
  /** A touch point was placed on the screen. */
  TOUCH_START = "touchstart",
  /** A touch point was moved on the screen. */
  TOUCH_MOVE = "touchmove",
  /** A touch point was removed from the screen. */
  TOUCH_END = "touchend",
  FOCUS = "focus",
  BLUR = "blur",
  POINTER_LOCK = "pointerlockchange",
  POINTER_UNLOCK = "pointer_unlock",
  GAMEPAD_DOWN = "gamepad_down",
  GAMEPAD_UP = "gamepad_up",
  GAMEPAD_AXIS = "gamepad_axis",
  GAMEPAD_CONNECTED = "gamepadconnected",
  GAMEPAD_DISCONNECTED = "gamepaddisconnected",
  DRAG_OVER = "dragover",
  DRAG_LEAVE = "dragleave",
  DROP = "drop",
}
