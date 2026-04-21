/**
 * Graphics context factory.
 *
 * Creates the core {@link Gfx} instance that manages GPU resources, render
 * passes, and draw commands. Normally you do not call this directly -- the
 * {@link run} function creates it for you. Use this when you need full control
 * over device and context creation.
 *
 * @module
 */

import {
  type SgBuffer, type SgImage, type SgSampler, type SgShader, type SgPipeline, type SgQuerySet,
  type BufferDesc, type ImageDesc, type SamplerDesc, type ShaderDesc, type PipelineDesc,
  type QuerySetDesc,
  type ComputeShaderDesc, type ComputePipelineDesc, type ComputeBindings,
  type Bindings, type PassDesc, type Gfx, type Handle, type DrawStats, type ShaderRecompileResult,
  type TextureDimension,
  BufferUsage, IndexType, LoadAction, StoreAction, PixelFormat, PrimitiveType, CullMode, CompareFunc,
  FilterMode, WrapMode, BlendFactor, BlendOp, StencilOp,
} from "./types.js";

/** Number of uniform ring-buffer slots to prevent CPU/GPU aliasing. */
export const NUM_FRAMES_IN_FLIGHT = 2;

// ---------------------------------------------------------------------------
// Format info helpers
// ---------------------------------------------------------------------------

interface FormatInfo {
  bytesPerBlock: number;
  blockWidth: number;
  blockHeight: number;
  isCompressed: boolean;
  isDepth: boolean;
}

/** Returns per-texel (or per-block) size information for a given pixel format. */
export function getFormatInfo(fmt: PixelFormat): FormatInfo {
  switch (fmt) {
    case PixelFormat.R8:                return { bytesPerBlock: 1,  blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: false };
    case PixelFormat.RG8:               return { bytesPerBlock: 2,  blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: false };
    case PixelFormat.RGBA8:             return { bytesPerBlock: 4,  blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: false };
    case PixelFormat.BGRA8:             return { bytesPerBlock: 4,  blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: false };
    case PixelFormat.RGBA16F:           return { bytesPerBlock: 8,  blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: false };
    case PixelFormat.RGBA32F:           return { bytesPerBlock: 16, blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: false };
    case PixelFormat.DEPTH24_STENCIL8:  return { bytesPerBlock: 4,  blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: true  };
    case PixelFormat.DEPTH32F:          return { bytesPerBlock: 4,  blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: true  };
    // BC formats (4x4 blocks)
    case PixelFormat.BC1_RGBA:
    case PixelFormat.BC1_RGBA_SRGB:     return { bytesPerBlock: 8,  blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    case PixelFormat.BC3_RGBA:
    case PixelFormat.BC3_RGBA_SRGB:     return { bytesPerBlock: 16, blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    case PixelFormat.BC4_R:             return { bytesPerBlock: 8,  blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    case PixelFormat.BC5_RG:            return { bytesPerBlock: 16, blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    case PixelFormat.BC6H_RGB:          return { bytesPerBlock: 16, blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    case PixelFormat.BC7_RGBA:
    case PixelFormat.BC7_RGBA_SRGB:     return { bytesPerBlock: 16, blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    // ETC2 (4x4 blocks)
    case PixelFormat.ETC2_RGB8:
    case PixelFormat.ETC2_RGB8_SRGB:    return { bytesPerBlock: 8,  blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    case PixelFormat.ETC2_RGBA8:
    case PixelFormat.ETC2_RGBA8_SRGB:   return { bytesPerBlock: 16, blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    // ASTC
    case PixelFormat.ASTC_4X4:
    case PixelFormat.ASTC_4X4_SRGB:     return { bytesPerBlock: 16, blockWidth: 4, blockHeight: 4, isCompressed: true,  isDepth: false };
    case PixelFormat.ASTC_8X8:
    case PixelFormat.ASTC_8X8_SRGB:     return { bytesPerBlock: 16, blockWidth: 8, blockHeight: 8, isCompressed: true,  isDepth: false };
    default:                            return { bytesPerBlock: 4,  blockWidth: 1, blockHeight: 1, isCompressed: false, isDepth: false };
  }
}

/**
 * Computes the bytes-per-row for a given format and width.
 * No 256-byte alignment is applied because writeTexture does not require it.
 */
export function bytesPerRowForFormat(fmt: PixelFormat, width: number): number {
  const info = getFormatInfo(fmt);
  const blocksWide = Math.ceil(width / info.blockWidth);
  return blocksWide * info.bytesPerBlock;
}

/** Compute the full mipmap level count for the given dimensions. */
function maxMipLevels(width: number, height: number, depth = 1): number {
  return 1 + Math.floor(Math.log2(Math.max(width, height, depth)));
}

/** Required GPU feature name for each compressed format family. */
export function requiredFeatureForFormat(fmt: PixelFormat): GPUFeatureName | null {
  switch (fmt) {
    case PixelFormat.BC1_RGBA:
    case PixelFormat.BC1_RGBA_SRGB:
    case PixelFormat.BC3_RGBA:
    case PixelFormat.BC3_RGBA_SRGB:
    case PixelFormat.BC4_R:
    case PixelFormat.BC5_RG:
    case PixelFormat.BC6H_RGB:
    case PixelFormat.BC7_RGBA:
    case PixelFormat.BC7_RGBA_SRGB:
      return "texture-compression-bc";
    case PixelFormat.ETC2_RGB8:
    case PixelFormat.ETC2_RGB8_SRGB:
    case PixelFormat.ETC2_RGBA8:
    case PixelFormat.ETC2_RGBA8_SRGB:
      return "texture-compression-etc2";
    case PixelFormat.ASTC_4X4:
    case PixelFormat.ASTC_4X4_SRGB:
    case PixelFormat.ASTC_8X8:
    case PixelFormat.ASTC_8X8_SRGB:
      return "texture-compression-astc";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Mipmap generation via GPU blit passes
// ---------------------------------------------------------------------------

/** Mipmap WGSL shader source -- renders a fullscreen triangle sampling from the previous mip level. */
const MIPMAP_WGSL = /* wgsl */`
@group(0) @binding(0) var srcTexture: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;

struct VSOutput {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs_main(@builtin(vertex_index) vi: u32) -> VSOutput {
  // Fullscreen triangle: 3 vertices covering clip-space [-1,1]
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var out: VSOutput;
  out.pos = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(uv.x, 1.0 - uv.y);
  return out;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(srcTexture, srcSampler, uv);
}
`;

// Lazily cached pipeline/sampler -- created once per device.
const mipmapPipelineCache = new WeakMap<GPUDevice, Map<GPUTextureFormat, GPURenderPipeline>>();
const mipmapSamplerCache = new WeakMap<GPUDevice, GPUSampler>();

function getMipmapPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
  let formatMap = mipmapPipelineCache.get(device);
  if (!formatMap) {
    formatMap = new Map();
    mipmapPipelineCache.set(device, formatMap);
  }
  let pip = formatMap.get(format);
  if (!pip) {
    const mod = device.createShaderModule({ code: MIPMAP_WGSL, label: "sokol_mipmap" });
    pip = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: mod, entryPoint: "vs_main" },
      fragment: { module: mod, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
      label: `sokol_mipmap_${format}`,
    });
    formatMap.set(format, pip);
  }
  return pip;
}

function getMipmapSampler(device: GPUDevice): GPUSampler {
  let s = mipmapSamplerCache.get(device);
  if (!s) {
    s = device.createSampler({ minFilter: "linear", magFilter: "linear" });
    mipmapSamplerCache.set(device, s);
  }
  return s;
}

/**
 * Generates mipmaps for a texture by rendering each mip level from the
 * previous level using a linear-sampled fullscreen triangle.
 * Handles array layers and cube faces by iterating over all layers.
 */
function generateMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  format: GPUTextureFormat,
  mipLevelCount: number,
  arrayLayerCount: number,
): void {
  const pipeline = getMipmapPipeline(device, format);
  const sampler = getMipmapSampler(device);
  const encoder = device.createCommandEncoder({ label: "sokol_mipmap_gen" });

  for (let layer = 0; layer < arrayLayerCount; layer++) {
    for (let level = 1; level < mipLevelCount; level++) {
      const srcView = texture.createView({
        baseMipLevel: level - 1,
        mipLevelCount: 1,
        baseArrayLayer: layer,
        arrayLayerCount: 1,
        dimension: "2d",
      });
      const dstView = texture.createView({
        baseMipLevel: level,
        mipLevelCount: 1,
        baseArrayLayer: layer,
        arrayLayerCount: 1,
        dimension: "2d",
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: sampler },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: dstView,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3); // fullscreen triangle
      pass.end();
    }
  }

  device.queue.submit([encoder.finish()]);
}

// ---------------------------------------------------------------------------
// Generation-counted handle encoding (matches Sokol's _sg_slot_t strategy)
// ---------------------------------------------------------------------------

const POOL_BITS = 16;
const GEN_BITS  = 16;
const POOL_MASK = (1 << POOL_BITS) - 1;   // 0x0000_FFFF
const GEN_MASK  = (1 << GEN_BITS)  - 1;   // 0x0000_FFFF
const GEN_SHIFT = POOL_BITS;

function encodeHandle(index: number, gen: number): number {
  return ((gen & GEN_MASK) << GEN_SHIFT) | (index & POOL_MASK);
}
function slotIndex(id: number): number  { return id & POOL_MASK; }
function generation(id: number): number { return (id >>> GEN_SHIFT) & GEN_MASK; }

// ---------------------------------------------------------------------------
// Pool implementation
// ---------------------------------------------------------------------------

const enum SlotState { INVALID = 0, ALLOC = 1, VALID = 2 }

interface PoolSlot<T> {
  gen:   number;
  state: SlotState;
  res:   T | undefined;
}

class Pool<T> {
  private slots: PoolSlot<T>[];
  private freeList: number[];

  constructor(capacity: number) {
    // slot 0 is reserved as the "null" sentinel
    this.slots = Array.from({ length: capacity + 1 }, () =>
      ({ gen: 0, state: SlotState.INVALID, res: undefined }));
    this.freeList = Array.from({ length: capacity }, (_, i) => i + 1);
  }

  alloc(): number {
    const index = this.freeList.pop();
    if (index === undefined) throw new Error("Pool exhausted");
    const slot = this.slots[index];
    slot.gen = (slot.gen + 1) & GEN_MASK;   // increment; wraps within 16-bit generation range
    slot.state = SlotState.ALLOC;
    return encodeHandle(index, slot.gen);
  }

  set(id: number, res: T): void {
    const s = this.lookup(id);
    if (!s) throw new Error("Pool.set on invalid handle");
    s.res = res;
    s.state = SlotState.VALID;
  }

  get(id: number): T | undefined {
    return this.lookup(id)?.res;
  }

  free(id: number): T | undefined {
    const index = slotIndex(id);
    const slot = this.slots[index];
    if (slot.state === SlotState.INVALID || slot.gen !== generation(id)) return undefined;
    const res = slot.res;
    slot.res = undefined;
    slot.state = SlotState.INVALID;
    this.freeList.push(index);
    return res;
  }

  private lookup(id: number): PoolSlot<T> | undefined {
    const index = slotIndex(id);
    if (index === 0) return undefined;
    const slot = this.slots[index];
    if (slot.state === SlotState.INVALID) return undefined;
    if (slot.gen !== generation(id)) return undefined;  // stale generation
    return slot;
  }

  /** Returns all live resource values — used by leak detection. */
  liveResources(): T[] {
    return this.slots
      .filter(s => s.state === SlotState.VALID && s.res !== undefined)
      .map(s => s.res!);
  }
}

// ---------------------------------------------------------------------------
// Slot types
// ---------------------------------------------------------------------------

interface BufferSlot {
  gpu: GPUBuffer;
  desc: BufferDesc;
}

interface ImageSlot {
  texture: GPUTexture;
  view: GPUTextureView;
  desc: ImageDesc;
}

interface SamplerSlot {
  gpu: GPUSampler;
  desc: SamplerDesc;
}

interface ShaderSlot {
  vertexModule: GPUShaderModule;
  fragmentModule: GPUShaderModule;
  vertexEntry: string;
  fragmentEntry: string;
  vertexSource: string;
  fragmentSource: string;
}

interface PipelineSlot {
  gpu: GPURenderPipeline;
  desc: PipelineDesc;
  gpuDesc: GPURenderPipelineDescriptor;
  indexType: IndexType;
}

interface QuerySetSlot {
  gpu: GPUQuerySet;
  desc: QuerySetDesc;
}

interface ComputeShaderSlot {
  computeModule: GPUShaderModule;
  entryPoint: string;
  source: string;
}

interface ComputePipelineSlot {
  gpu: GPUComputePipeline;
  desc: ComputePipelineDesc;
  storageBindGroupLayout: GPUBindGroupLayout | null;
}

/**
 * Create a new {@link Gfx} graphics context.
 *
 * This is the low-level factory used internally by {@link run}. Call it
 * directly when you want to manage the WebGPU device, canvas context, and
 * frame loop yourself.
 *
 * @param device - A `GPUDevice` to use for resource creation and command submission.
 * @param canvas - The `HTMLCanvasElement` to render into.
 * @param context - The `GPUCanvasContext` obtained from the canvas.
 * @param format - The preferred swapchain texture format (e.g. from `navigator.gpu.getPreferredCanvasFormat()`).
 * @param options - Optional configuration. `uniformBufferSize` sets the per-frame uniform staging buffer size (default 4 MB).
 * @returns A fully initialised {@link Gfx} instance.
 */
export function createGfx(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  options?: { uniformBufferSize?: number },
): Gfx {
  const bufferPool   = new Pool<BufferSlot>(128);
  const imagePool    = new Pool<ImageSlot>(128);
  const samplerPool  = new Pool<SamplerSlot>(64);
  const shaderPool   = new Pool<ShaderSlot>(64);
  const pipelinePool = new Pool<PipelineSlot>(64);
  const querySetPool = new Pool<QuerySetSlot>(32);
  const computeShaderPool = new Pool<ComputeShaderSlot>(64);
  const computePipelinePool = new Pool<ComputePipelineSlot>(64);
  const pipelineCache = new Map<string, GPURenderPipeline>();
  // shader handle id -> set of pipeline handle ids that reference it
  const shaderPipelineDeps = new Map<number, Set<number>>();

  // Per-frame state
  let encoder: GPUCommandEncoder | null = null;
  let passEncoder: GPURenderPassEncoder | null = null;
  let computePassEncoder: GPUComputePassEncoder | null = null;
  let currentComputePipeline: ComputePipelineSlot | null = null;
  let currentPipeline: PipelineSlot | null = null;
  let currentPipelineId = 0;
  let frameTime = 0;
  let lastFrameTime = 0;
  let _frameCount = 0;
  let uniformOffset = 0;
  let boundVertexBuffers: BufferSlot[] = [];
  let boundIndexBuffer: BufferSlot | null = null;
  let _frameStats: DrawStats = { drawCalls: 0, totalElements: 0, indirectDrawCalls: 0, dispatchCalls: 0 };

  // Texture/sampler bind group cache (group 1): keyed on "pipelineId:img1,img2,...:smp1,smp2,..."
  const textureSamplerBindGroupCache = new Map<string, GPUBindGroup>();

  const DEFAULT_UNIFORM_BUFFER_SIZE = 4 * 1024 * 1024; // 4 MB, matching upstream sokol-C
  const UNIFORM_BUFFER_SIZE = options?.uniformBufferSize ?? DEFAULT_UNIFORM_BUFFER_SIZE;
  // The per-slot binding size (256 bytes) is the window exposed to the shader
  // via dynamic offsets. Validate that this fits within the device limit.
  const UNIFORM_SLOT_SIZE = 256;
  if (UNIFORM_SLOT_SIZE > device.limits.maxUniformBufferBindingSize) {
    throw new Error(
      `Uniform slot size (${UNIFORM_SLOT_SIZE}) exceeds device limit maxUniformBufferBindingSize (${device.limits.maxUniformBufferBindingSize})`
    );
  }
  let uniformFrameIndex = 0;

  // Shared bind group layout for the uniform ring buffers (group 0, binding 0, dynamic offset)
  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: "uniform", hasDynamicOffset: true },
    }],
  });

  // Shared bind group layout for compute uniform ring buffers (group 0, binding 0, dynamic offset)
  const computeUniformBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "uniform", hasDynamicOffset: true },
    }],
  });

  // Compute uniform bind groups (reuse the same buffers but with COMPUTE visibility layout)
  const computeUniformBindGroups: GPUBindGroup[] = [];

  // Allocate NUM_FRAMES_IN_FLIGHT uniform buffers and one bind group per slot up front
  const uniformBuffers: GPUBuffer[] = [];
  const uniformBindGroups: GPUBindGroup[] = [];
  for (let i = 0; i < NUM_FRAMES_IN_FLIGHT; i++) {
    const buf = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `uniform_ring_${i}`,
    });
    uniformBuffers.push(buf);
    uniformBindGroups.push(device.createBindGroup({
      layout: uniformBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: buf, size: UNIFORM_SLOT_SIZE } }],
      label: `uniform_bind_group_${i}`,
    }));
    computeUniformBindGroups.push(device.createBindGroup({
      layout: computeUniformBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: buf, size: UNIFORM_BUFFER_SIZE } }],
      label: `compute_uniform_bind_group_${i}`,
    }));
  }

  function currentUniformBuffer() {
    return uniformBuffers[uniformFrameIndex];
  }

  function currentUniformBindGroup() {
    return uniformBindGroups[uniformFrameIndex];
  }

  function currentComputeUniformBindGroup() {
    return computeUniformBindGroups[uniformFrameIndex];
  }

  function pipelineKey(desc: PipelineDesc): string {
    return JSON.stringify({
      shader: desc.shader.id,
      layout: desc.layout,
      primitive: desc.primitive,
      cullMode: desc.cullMode,
      indexType: desc.indexType,
      colors: desc.colors,
      depth: desc.depth,
      images: desc.images,
      imageViewDimensions: desc.imageViewDimensions,
      samplerCount: desc.samplerCount,
      storageBuffers: desc.storageBuffers,
      storageBufferAccess: desc.storageBufferAccess,
      multisample: desc.multisample,
    });
  }

  function gpuBufferUsage(usage: BufferUsage | undefined): number {
    switch (usage) {
      case BufferUsage.IMMUTABLE:
        // No COPY_DST — data is supplied only at creation via mappedAtCreation
        return GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX;
      case BufferUsage.DYNAMIC:
      case BufferUsage.STREAM:
        return GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX;
      case BufferUsage.INDIRECT:
        return GPUBufferUsage.COPY_DST | GPUBufferUsage.INDIRECT;
      case BufferUsage.QUERY_RESOLVE:
        return GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC;
      case BufferUsage.STAGING:
        return GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ;
      case BufferUsage.STORAGE:
        return GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
      default:
        return GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helper for pipeline hot-reload rebuilding
  // Instead of duplicating pipeline construction logic, we store the original
  // GPURenderPipelineDescriptor at creation time and clone it on rebuild,
  // only replacing the shader modules. This ensures 1:1 fidelity with the
  // original pipeline regardless of blend, stencil, MSAA, or bind group config.

  async function rebuildPipeline(pipId: number, slot: PipelineSlot): Promise<void> {
    const shd = shaderPool.get(slot.desc.shader.id);
    if (!shd) return;

    // Invalidate the pipeline cache — the shader modules have changed,
    // so any cached GPU pipeline keyed against the old shader is stale.
    pipelineCache.clear();

    // Clone the stored descriptor and replace only the shader modules
    const rebuiltDesc: GPURenderPipelineDescriptor = {
      ...slot.gpuDesc,
      vertex: {
        ...slot.gpuDesc.vertex,
        module: shd.vertexModule,
      },
      fragment: slot.gpuDesc.fragment ? {
        ...slot.gpuDesc.fragment,
        module: shd.fragmentModule,
      } : undefined,
    };

    try {
      const newGpuPipeline = await device.createRenderPipelineAsync(rebuiltDesc);
      // Atomic slot swap -- handle id is unchanged, existing references stay valid
      slot.gpu = newGpuPipeline;
      // Invalidate cached bind groups since the pipeline object changed
      invalidateCachesForPipeline(pipId);
      const pipHandle: SgPipeline = { _brand: "SgPipeline", id: pipId } as SgPipeline;
      gfx.onPipelineRebuilt?.(pipHandle);
    } catch (err) {
      console.warn(`[sokol-ts] Pipeline ${pipId} rebuild failed, keeping old pipeline:`, err);
      const pipHandle: SgPipeline = { _brand: "SgPipeline", id: pipId } as SgPipeline;
      gfx.onPipelineRebuildError?.(pipHandle, err);
    }
  }

  // ---------------------------------------------------------------------------

  // Cache invalidation helpers
  function invalidateTextureSamplerCacheForResource(resourceId: number, kind: "img" | "smp" | "sbuf") {
    // Cache keys have the form "pipelineId:img1,img2,...:smp1,smp2,...:sbuf1,sbuf2,..."
    // We need to find entries that reference this resource in the appropriate segment.
    const segmentIndex = kind === "img" ? 1 : kind === "smp" ? 2 : 3;
    for (const key of textureSamplerBindGroupCache.keys()) {
      const parts = key.split(":");
      const segment = parts[segmentIndex];
      if (segment) {
        const ids = segment.split(",");
        if (ids.includes(String(resourceId))) {
          textureSamplerBindGroupCache.delete(key);
        }
      }
    }
  }

  function invalidateCachesForPipeline(pipelineId: number) {
    const prefix = `${pipelineId}:`;
    for (const key of textureSamplerBindGroupCache.keys()) {
      if (key.startsWith(prefix)) {
        textureSamplerBindGroupCache.delete(key);
      }
    }
  }

  const gfx: Gfx = {
    get canvas() { return canvas; },
    get device() { return device; },
    get width() { return canvas.width; },
    get height() { return canvas.height; },
    get cssWidth() { return canvas.clientWidth; },
    get cssHeight() { return canvas.clientHeight; },
    get dpiScale() { return canvas.width / (canvas.clientWidth || 1); },
    get dt() { return frameTime; },
    get frameCount() { return _frameCount; },
    get frameStats(): DrawStats { return { ..._frameStats }; },

    makeBuffer(desc: BufferDesc): SgBuffer {
      const id = bufferPool.alloc();
      const rawSize = desc.data ? desc.data.byteLength : (desc.size ?? 256);
      const alignedSize = Math.max(4, Math.ceil(rawSize / 4) * 4);
      const gpu = device.createBuffer({
        size: alignedSize,
        usage: gpuBufferUsage(desc.usage),
        mappedAtCreation: !!desc.data,
        label: desc.label,
      });
      if (desc.data) {
        new Uint8Array(gpu.getMappedRange()).set(new Uint8Array(desc.data.buffer, desc.data.byteOffset, desc.data.byteLength));
        gpu.unmap();
      }
      bufferPool.set(id, { gpu, desc });
      return { _brand: "SgBuffer", id } as SgBuffer;
    },

    makeImage(desc: ImageDesc): SgImage {
      const id = imagePool.alloc();
      const fmt = (desc.format ?? PixelFormat.RGBA8) as GPUTextureFormat;
      const fmtInfo = getFormatInfo(desc.format ?? PixelFormat.RGBA8);
      const dim: TextureDimension = desc.dimension ?? "2d";
      const is3D = dim === "3d";
      const isCube = dim === "cube";
      const isCubeArray = dim === "cube-array";

      // Validate compressed format feature support
      const requiredFeature = requiredFeatureForFormat(desc.format ?? PixelFormat.RGBA8);
      if (requiredFeature && !device.features.has(requiredFeature)) {
        throw new Error(
          `[sokol-ts] Format "${desc.format}" requires device feature "${requiredFeature}" which is not available. ` +
          `Request it via requiredFeatures in AppDesc.`
        );
      }

      // Resolve depth/array layers
      let depthOrArrayLayers: number;
      if (isCubeArray) {
        depthOrArrayLayers = (desc.numSlices ?? 1) * 6;
      } else if (isCube) {
        depthOrArrayLayers = 6;
      } else if (is3D) {
        depthOrArrayLayers = desc.depth ?? 1;
      } else {
        depthOrArrayLayers = desc.numSlices ?? 1;
      }

      // Resolve mip level count
      const canGenerateMips = !fmtInfo.isDepth && !is3D && !fmtInfo.isCompressed;
      let mipLevelCount: number;
      if (desc.numMipmaps === 0) {
        // 0 = auto full chain
        mipLevelCount = canGenerateMips ? maxMipLevels(desc.width, desc.height) : 1;
      } else {
        mipLevelCount = desc.numMipmaps ?? 1;
      }

      let usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
      if (desc.renderTarget) {
        usage |= GPUTextureUsage.RENDER_ATTACHMENT;
      }
      // Mipmap generation requires RENDER_ATTACHMENT on the texture
      if (mipLevelCount > 1 && canGenerateMips) {
        usage |= GPUTextureUsage.RENDER_ATTACHMENT;
      }

      // Both cube and cube-array use "2d" as the underlying GPU texture dimension
      const gpuDimension: GPUTextureDimension = is3D ? "3d" : "2d";

      const texture = device.createTexture({
        size: { width: desc.width, height: desc.height, depthOrArrayLayers },
        dimension: gpuDimension,
        format: fmt,
        usage,
        mipLevelCount,
        sampleCount: desc.sampleCount ?? 1,
        label: desc.label,
      });

      if (desc.data) {
        const bpr = bytesPerRowForFormat(desc.format ?? PixelFormat.RGBA8, desc.width);
        device.queue.writeTexture(
          { texture },
          desc.data,
          { bytesPerRow: bpr, rowsPerImage: desc.height },
          { width: desc.width, height: desc.height, depthOrArrayLayers },
        );
      }

      // Create the appropriate texture view
      let viewDimension: GPUTextureViewDimension;
      if (isCubeArray) {
        viewDimension = "cube-array";
      } else if (isCube) {
        viewDimension = "cube";
      } else if (is3D) {
        viewDimension = "3d";
      } else if ((desc.numSlices ?? 1) > 1) {
        viewDimension = "2d-array";
      } else {
        viewDimension = "2d";
      }
      const view = texture.createView({ dimension: viewDimension });

      // Auto-generate mipmaps if requested and supported
      if (mipLevelCount > 1 && canGenerateMips && desc.data) {
        generateMipmaps(device, texture, fmt, mipLevelCount, depthOrArrayLayers);
      }

      imagePool.set(id, { texture, view, desc });
      return { _brand: "SgImage", id } as SgImage;
    },

    makeSampler(desc: SamplerDesc): SgSampler {
      const id = samplerPool.alloc();
      const minFilter = desc.minFilter ?? FilterMode.NEAREST;
      const magFilter = desc.magFilter ?? FilterMode.NEAREST;
      const mipmapFilter = desc.mipmapFilter ?? FilterMode.NEAREST;
      // WebGPU requires all three filters to be "linear" when maxAnisotropy > 1;
      // silently clamp to 1 when they are not (mirrors Sokol's hint semantics).
      const allLinear = minFilter === FilterMode.LINEAR
        && magFilter === FilterMode.LINEAR
        && mipmapFilter === FilterMode.LINEAR;
      const maxAnisotropy = allLinear ? Math.max(1, Math.min(16, desc.maxAnisotropy ?? 1)) : 1;
      const gpu = device.createSampler({
        minFilter,
        magFilter,
        mipmapFilter,
        addressModeU: desc.wrapU ?? WrapMode.REPEAT,
        addressModeV: desc.wrapV ?? WrapMode.REPEAT,
        compare: desc.compare as GPUCompareFunction | undefined,
        maxAnisotropy,
        lodMinClamp: desc.lodMinClamp ?? 0,
        lodMaxClamp: desc.lodMaxClamp ?? 32,
        label: desc.label,
      });
      samplerPool.set(id, { gpu, desc });
      return { _brand: "SgSampler", id } as SgSampler;
    },

    async makeShader(desc: ShaderDesc): Promise<SgShader> {
      const id = shaderPool.alloc();
      const combinedSource = desc.source;
      const vertexModule = device.createShaderModule({
        code: combinedSource ?? desc.vertexSource!,
        label: desc.label ? `${desc.label}_vs` : undefined,
      });
      const fragmentModule = combinedSource
        ? vertexModule
        : device.createShaderModule({
            code: desc.fragmentSource!,
            label: desc.label ? `${desc.label}_fs` : undefined,
          });

      async function checkCompilation(mod: GPUShaderModule, stage: string) {
        const info = await mod.getCompilationInfo();
        for (const msg of info.messages) {
          const loc = `${msg.lineNum}:${msg.linePos}`;
          if (msg.type === "error") throw new Error(`[${stage} shader] ${loc}: ${msg.message}`);
          if (msg.type === "warning") console.warn(`[${stage} shader] ${loc}: ${msg.message}`);
        }
      }

      await Promise.all([
        checkCompilation(vertexModule, "vertex"),
        // Only check fragment separately when it's a different module
        ...(fragmentModule !== vertexModule ? [checkCompilation(fragmentModule, "fragment")] : []),
      ]);

      const vertexEntry = desc.vertexEntry ?? "vs_main";
      const fragmentEntry = desc.fragmentEntry ?? "fs_main";
      const vertexSource = combinedSource ?? desc.vertexSource!;
      const fragmentSource = combinedSource ?? desc.fragmentSource ?? vertexSource;
      shaderPool.set(id, { vertexModule, fragmentModule, vertexEntry, fragmentEntry, vertexSource, fragmentSource });
      return { _brand: "SgShader", id } as SgShader;
    },

    makePipeline(desc: PipelineDesc): SgPipeline {
      const shd = shaderPool.get(desc.shader.id);
      if (!shd) throw new Error("Invalid or stale shader handle");
      const id = pipelinePool.alloc();

      const vertexBuffers: GPUVertexBufferLayout[] = desc.layout.buffers.map((buf, i) => ({
        arrayStride: buf.stride,
        stepMode: buf.stepMode ?? "vertex",
        attributes: desc.layout.attrs
          .filter(a => (a.bufferIndex ?? 0) === i)
          .map(a => ({
            format: a.format as GPUVertexFormat,
            offset: a.offset ?? 0,
            shaderLocation: a.shaderLocation,
          })),
      }));

      const colorTargets: GPUColorTargetState[] = (desc.colors ?? [{}]).map(c => ({
        format: (c.format as GPUTextureFormat) ?? format,
        blend: c.blendEnabled ? {
          color: {
            srcFactor: (c.colorBlend?.srcFactor ?? BlendFactor.SRC_ALPHA) as GPUBlendFactor,
            dstFactor: (c.colorBlend?.dstFactor ?? BlendFactor.ONE_MINUS_SRC_ALPHA) as GPUBlendFactor,
            operation: (c.colorBlend?.operation ?? BlendOp.ADD) as GPUBlendOperation,
          },
          alpha: {
            srcFactor: (c.alphaBlend?.srcFactor ?? BlendFactor.ONE) as GPUBlendFactor,
            dstFactor: (c.alphaBlend?.dstFactor ?? BlendFactor.ONE_MINUS_SRC_ALPHA) as GPUBlendFactor,
            operation: (c.alphaBlend?.operation ?? BlendOp.ADD) as GPUBlendOperation,
          },
        } as GPUBlendState : undefined,
        writeMask: c.writeMask ?? GPUColorWrite.ALL,
      }));

      const bindGroupLayouts: GPUBindGroupLayout[] = [];

      // Group 0: uniform buffer (always present) — reuse the shared layout
      bindGroupLayouts.push(uniformBindGroupLayout);

      // Group 1: textures + samplers + storage buffers (if any)
      // Texture bindings occupy locations 0..images-1;
      // sampler bindings occupy locations images..images+samplerCount-1;
      // storage buffer bindings occupy locations images+samplerCount..images+samplerCount+storageBufferCount-1.
      const imageCount = desc.images ?? 0;
      const samplerCount = desc.samplerCount ?? 0;
      const storageBufferCount = desc.storageBuffers ?? 0;
      if (imageCount > 0 || samplerCount > 0 || storageBufferCount > 0) {
        const group1Entries: GPUBindGroupLayoutEntry[] = [];
        for (let i = 0; i < imageCount; i++) {
          const viewDim = desc.imageViewDimensions?.[i];
          group1Entries.push({
            binding: i,
            visibility: GPUShaderStage.FRAGMENT,
            texture: viewDim ? { viewDimension: viewDim } : {},
          });
        }
        for (let i = 0; i < samplerCount; i++) {
          group1Entries.push({
            binding: imageCount + i,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {},
          });
        }
        const storageBindingBase = imageCount + samplerCount;
        for (let i = 0; i < storageBufferCount; i++) {
          const accessType = desc.storageBufferAccess?.[i] ?? "storage";
          group1Entries.push({
            binding: storageBindingBase + i,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: accessType as GPUBufferBindingType },
          });
        }
        bindGroupLayouts.push(device.createBindGroupLayout({ entries: group1Entries }));
      }

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts,
      });

      // Build stencil face descriptors
      function buildStencilFace(face: NonNullable<typeof desc.depth>["stencilFront"]): GPUStencilFaceState | undefined {
        if (!face) return undefined;
        return {
          compare: (face.compare ?? CompareFunc.ALWAYS) as GPUCompareFunction,
          failOp: (face.failOp ?? StencilOp.KEEP) as GPUStencilOperation,
          depthFailOp: (face.depthFailOp ?? StencilOp.KEEP) as GPUStencilOperation,
          passOp: (face.passOp ?? StencilOp.KEEP) as GPUStencilOperation,
        };
      }

      const gpuPipelineDesc: GPURenderPipelineDescriptor = {
        layout: pipelineLayout,
        vertex: {
          module: shd.vertexModule,
          entryPoint: shd.vertexEntry,
          buffers: vertexBuffers,
        },
        fragment: {
          module: shd.fragmentModule,
          entryPoint: shd.fragmentEntry,
          targets: colorTargets,
        },
        primitive: {
          topology: (desc.primitive ?? PrimitiveType.TRIANGLES) as GPUPrimitiveTopology,
          cullMode: (desc.cullMode ?? CullMode.NONE) as GPUCullMode,
          stripIndexFormat: desc.primitive === PrimitiveType.TRIANGLE_STRIP || desc.primitive === PrimitiveType.LINE_STRIP
            ? (desc.indexType === IndexType.UINT32 ? "uint32" : "uint16")
            : undefined,
        },
        depthStencil: desc.depth ? {
          format: (desc.depth.format ?? PixelFormat.DEPTH24_STENCIL8) as GPUTextureFormat,
          depthWriteEnabled: desc.depth.depthWrite ?? true,
          depthCompare: (desc.depth.depthCompare ?? CompareFunc.LESS) as GPUCompareFunction,
          stencilFront: buildStencilFace(desc.depth.stencilFront),
          stencilBack: buildStencilFace(desc.depth.stencilBack),
          stencilReadMask: desc.depth.stencilReadMask ?? 0xFF,
          stencilWriteMask: desc.depth.stencilWriteMask ?? 0xFF,
        } : undefined,
        multisample: desc.multisample ? {
          count: desc.multisample.count ?? 4,
          alphaToCoverageEnabled: desc.multisample.alphaToCoverage ?? false,
        } : undefined,
        label: desc.label,
      };

      const key = pipelineKey(desc);
      let gpuPipeline = pipelineCache.get(key);
      if (!gpuPipeline) {
        gpuPipeline = device.createRenderPipeline(gpuPipelineDesc);
        pipelineCache.set(key, gpuPipeline);
      }

      pipelinePool.set(id, { gpu: gpuPipeline, desc, gpuDesc: gpuPipelineDesc, indexType: desc.indexType ?? IndexType.NONE });

      // Track shader -> pipeline dependency for hot-reload rebuilding
      const deps = shaderPipelineDeps.get(desc.shader.id) ?? new Set<number>();
      deps.add(id);
      shaderPipelineDeps.set(desc.shader.id, deps);

      return { _brand: "SgPipeline", id } as SgPipeline;
    },

    async makeComputeShader(desc: ComputeShaderDesc): Promise<SgShader> {
      const id = computeShaderPool.alloc();
      const computeModule = device.createShaderModule({
        code: desc.source,
        label: desc.label ? `${desc.label}_cs` : undefined,
      });

      const info = await computeModule.getCompilationInfo();
      for (const msg of info.messages) {
        const loc = `${msg.lineNum}:${msg.linePos}`;
        if (msg.type === "error") throw new Error(`[compute shader] ${loc}: ${msg.message}`);
        if (msg.type === "warning") console.warn(`[compute shader] ${loc}: ${msg.message}`);
      }

      const entryPoint = desc.entryPoint ?? "cs_main";
      computeShaderPool.set(id, { computeModule, entryPoint, source: desc.source });
      return { _brand: "SgShader", id } as SgShader;
    },

    makeComputePipeline(desc: ComputePipelineDesc): SgPipeline {
      const shd = computeShaderPool.get(desc.shader.id);
      if (!shd) throw new Error("Invalid or stale compute shader handle");
      const id = computePipelinePool.alloc();

      const bindGroupLayouts: GPUBindGroupLayout[] = [];

      // Group 0: uniform buffer (if uniforms are used)
      if (desc.uniforms) {
        bindGroupLayouts.push(computeUniformBindGroupLayout);
      }

      // Group 1 (or 0 if no uniforms): storage buffers
      const storageCount = Array.isArray(desc.storageBuffers)
        ? desc.storageBuffers.length
        : (desc.storageBuffers ?? 0);
      let storageBindGroupLayout: GPUBindGroupLayout | null = null;
      if (storageCount > 0) {
        const entries: GPUBindGroupLayoutEntry[] = [];
        for (let i = 0; i < storageCount; i++) {
          const binding = Array.isArray(desc.storageBuffers) ? desc.storageBuffers[i] : undefined;
          const readOnly = binding?.readOnly ?? false;
          entries.push({
            binding: i,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: readOnly ? "read-only-storage" : "storage" },
          });
        }
        storageBindGroupLayout = device.createBindGroupLayout({ entries });
        bindGroupLayouts.push(storageBindGroupLayout);
      }

      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts });

      const gpu = device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: shd.computeModule,
          entryPoint: shd.entryPoint,
        },
        label: desc.label,
      });

      computePipelinePool.set(id, { gpu, desc, storageBindGroupLayout });
      return { _brand: "SgPipeline", id } as SgPipeline;
    },

    async recompileShader(
      shd: SgShader,
      sources: { vertexSource?: string; fragmentSource?: string },
      callback?: (result: ShaderRecompileResult) => void,
    ): Promise<ShaderRecompileResult> {
      const slot = shaderPool.get(shd.id);
      if (!slot) {
        const result: ShaderRecompileResult = { ok: false, vertexError: "Invalid shader handle" };
        callback?.(result);
        return result;
      }

      const nextVertex = sources.vertexSource ?? slot.vertexSource;
      const nextFragment = sources.fragmentSource ?? slot.fragmentSource;

      // Diff-based early exit — no work if source is unchanged
      if (nextVertex === slot.vertexSource && nextFragment === slot.fragmentSource) {
        const result: ShaderRecompileResult = { ok: true, shader: shd };
        callback?.(result);
        return result;
      }

      // Compile new modules — createShaderModule never throws; errors surface via getCompilationInfo()
      const newVert = device.createShaderModule({ code: nextVertex, label: `${shd.id}_vs_hot` });
      const newFrag = device.createShaderModule({ code: nextFragment, label: `${shd.id}_fs_hot` });

      const [vertInfo, fragInfo] = await Promise.all([
        newVert.getCompilationInfo(),
        newFrag.getCompilationInfo(),
      ]);

      const vertErrors = vertInfo.messages
        .filter(m => m.type === "error")
        .map(m => m.message)
        .join("\n");
      const fragErrors = fragInfo.messages
        .filter(m => m.type === "error")
        .map(m => m.message)
        .join("\n");

      if (vertErrors || fragErrors) {
        const result: ShaderRecompileResult = {
          ok: false,
          vertexError: vertErrors || undefined,
          fragmentError: fragErrors || undefined,
        };
        callback?.(result);
        return result;
      }

      // Atomically commit new modules and updated source to the slot
      slot.vertexModule = newVert;
      slot.fragmentModule = newFrag;
      slot.vertexSource = nextVertex;
      slot.fragmentSource = nextFragment;

      const result: ShaderRecompileResult = { ok: true, shader: shd };
      callback?.(result);
      return result;
    },

    destroyBuffer(buf: SgBuffer) {
      // Invalidate any cached bind groups referencing this buffer as a storage buffer
      invalidateTextureSamplerCacheForResource(buf.id, "sbuf");
      const slot = bufferPool.free(buf.id);
      if (slot) slot.gpu.destroy();
    },
    destroyImage(img: SgImage) {
      // Invalidate any cached texture/sampler bind groups referencing this image
      invalidateTextureSamplerCacheForResource(img.id, "img");
      const slot = imagePool.free(img.id);
      if (slot) slot.texture.destroy();
    },
    destroySampler(smp: SgSampler) {
      // Invalidate any cached texture/sampler bind groups referencing this sampler
      invalidateTextureSamplerCacheForResource(smp.id, "smp");
      samplerPool.free(smp.id);
    },
    destroyShader(shd: SgShader) {
      // Try both render and compute shader pools
      const freed = shaderPool.free(shd.id);
      if (!freed) computeShaderPool.free(shd.id);
    },
    destroyPipeline(pip: SgPipeline) {
      // Try render pipeline pool first
      const slot = pipelinePool.get(pip.id);
      if (slot) {
        // Remove cached GPU pipeline for this descriptor so it won't be reused stale
        const key = pipelineKey(slot.desc);
        pipelineCache.delete(key);

        const deps = shaderPipelineDeps.get(slot.desc.shader.id);
        deps?.delete(pip.id);
        // Prune empty dep sets to avoid memory leaks
        if (deps && deps.size === 0) {
          shaderPipelineDeps.delete(slot.desc.shader.id);
        }
        // Invalidate cached bind groups for this pipeline
        invalidateCachesForPipeline(pip.id);
        pipelinePool.free(pip.id);
        return;
      }
      // Try compute pipeline pool
      computePipelinePool.free(pip.id);
    },

    makeQuerySet(desc: QuerySetDesc): SgQuerySet {
      if (!device.features.has("timestamp-query")) {
        throw new Error(
          `[sokol-ts] makeQuerySet requires the "timestamp-query" device feature. ` +
          `Request it via requiredFeatures in AppDesc.`
        );
      }
      const id = querySetPool.alloc();
      const gpu = device.createQuerySet({
        type: "timestamp",
        count: desc.count,
        label: desc.label,
      });
      querySetPool.set(id, { gpu, desc });
      return { _brand: "SgQuerySet", id } as SgQuerySet;
    },

    destroyQuerySet(qs: SgQuerySet) {
      const slot = querySetPool.free(qs.id);
      if (slot) slot.gpu.destroy();
    },

    resolveQuerySet(
      querySet: SgQuerySet,
      firstQuery: number,
      queryCount: number,
      destination: SgBuffer,
      destinationOffset = 0,
    ) {
      if (!encoder) throw new Error("No active command encoder -- call beginPass/endPass before resolveQuerySet");
      const qsSlot = querySetPool.get(querySet.id);
      if (!qsSlot) throw new Error("Invalid or stale query set handle");
      const bufSlot = bufferPool.get(destination.id);
      if (!bufSlot) throw new Error("Invalid or stale buffer handle");
      encoder.resolveQuerySet(qsSlot.gpu, firstQuery, queryCount, bufSlot.gpu, destinationOffset);
    },

    isValid(handle: Handle): boolean {
      switch (handle._brand) {
        case "SgBuffer":   return bufferPool.get(handle.id)   !== undefined;
        case "SgImage":    return imagePool.get(handle.id)    !== undefined;
        case "SgSampler":  return samplerPool.get(handle.id)  !== undefined;
        case "SgShader":   return shaderPool.get(handle.id) !== undefined || computeShaderPool.get(handle.id) !== undefined;
        case "SgPipeline": return pipelinePool.get(handle.id) !== undefined || computePipelinePool.get(handle.id) !== undefined;
        case "SgQuerySet": return querySetPool.get(handle.id) !== undefined;
        default: return false;
      }
    },

    updateBuffer(buf: SgBuffer, data: ArrayBufferView, dstOffset = 0) {
      const slot = bufferPool.get(buf.id);
      if (!slot) throw new Error("Invalid or stale buffer handle");
      if (slot.desc.usage === BufferUsage.IMMUTABLE) {
        throw new Error("Cannot update an IMMUTABLE buffer");
      }
      const writeBytes = Math.ceil(data.byteLength / 4) * 4;
      if (writeBytes === data.byteLength) {
        // Data is already 4-byte aligned, no padding needed
        device.queue.writeBuffer(slot.gpu, dstOffset, data.buffer, data.byteOffset, writeBytes);
      } else {
        // writeBytes exceeds data.byteLength; copy into a zero-padded buffer
        // to avoid reading past the end of the source ArrayBuffer
        const padded = new Uint8Array(writeBytes);
        padded.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        device.queue.writeBuffer(slot.gpu, dstOffset, padded.buffer, 0, writeBytes);
      }
    },

    writeImageBitmap(img: SgImage, bitmap: ImageBitmap) {
      const slot = imagePool.get(img.id);
      if (!slot) throw new Error("Invalid image handle");
      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: slot.texture },
        [bitmap.width, bitmap.height],
      );
    },

    updateImage(img: SgImage, data: ArrayBufferView, mipLevel = 0, arrayLayer = 0) {
      const slot = imagePool.get(img.id);
      if (!slot) throw new Error("Invalid image handle");
      const d = slot.desc;
      const mipWidth = Math.max(1, d.width >> mipLevel);
      const mipHeight = Math.max(1, d.height >> mipLevel);
      const bpr = bytesPerRowForFormat(d.format ?? PixelFormat.RGBA8, mipWidth);
      device.queue.writeTexture(
        { texture: slot.texture, mipLevel, origin: { x: 0, y: 0, z: arrayLayer } },
        data,
        { bytesPerRow: bpr, rowsPerImage: mipHeight },
        { width: mipWidth, height: mipHeight },
      );
    },

    shutdown() {
      for (const slot of bufferPool.liveResources())   { slot.gpu.destroy(); }
      for (const slot of imagePool.liveResources())    { slot.texture.destroy(); }
      for (const slot of querySetPool.liveResources()) { slot.gpu.destroy(); }
      // samplers, shaders, pipelines have no GPU destroy call

      const leakedBuffers   = bufferPool.liveResources();
      const leakedImages    = imagePool.liveResources();
      const leakedSamplers  = samplerPool.liveResources();
      const leakedShaders   = shaderPool.liveResources();
      const leakedPipelines = pipelinePool.liveResources();
      const leakedQuerySets = querySetPool.liveResources();
      const leakedComputeShaders   = computeShaderPool.liveResources();
      const leakedComputePipelines = computePipelinePool.liveResources();

      const leaked = leakedBuffers.length + leakedImages.length +
                     leakedSamplers.length + leakedShaders.length +
                     leakedPipelines.length + leakedQuerySets.length +
                     leakedComputeShaders.length + leakedComputePipelines.length;
      if (leaked > 0) {
        const labels: string[] = [];
        for (const s of leakedBuffers)   { if (s.desc.label)   labels.push(s.desc.label); }
        for (const s of leakedImages)    { if (s.desc.label)   labels.push(s.desc.label); }
        for (const s of leakedPipelines) { if (s.desc.label)   labels.push(s.desc.label); }
        for (const s of leakedQuerySets) { if (s.desc.label)   labels.push(s.desc.label); }
        for (const s of leakedComputePipelines) { if (s.desc.label) labels.push(s.desc.label); }
        const labelStr = labels.length > 0 ? ` (${labels.join(", ")})` : "";
        console.warn(`[sokol-ts] shutdown: ${leaked} resource(s) not explicitly destroyed${labelStr}`);
      }
    },

    beginPass(desc?: PassDesc) {
      // Create the encoder once per frame; reuse across multiple passes.
      if (!encoder) {
        encoder = device.createCommandEncoder();
      }

      function resolveLoadOp(action: LoadAction | undefined): GPULoadOp {
        return action === LoadAction.LOAD || action === LoadAction.DONTCARE
          ? "load"
          : "clear";
      }

      function resolveStoreOp(sa: StoreAction | undefined): GPUStoreOp {
        return sa === StoreAction.DISCARD ? "discard" : "store";
      }

      const colorAttachments: GPURenderPassColorAttachment[] = [];

      if (desc?.offscreen) {
        const resolveImages = desc.offscreen.resolveImages;
        for (let i = 0; i < desc.offscreen.colorImages.length; i++) {
          const img = imagePool.get(desc.offscreen.colorImages[i].id);
          if (!img) throw new Error("Invalid offscreen color image");
          const ca = desc.colorAttachments?.[i];
          const loadOp = resolveLoadOp(ca?.action);
          // Per-attachment resolveImage takes priority, then offscreen-level resolveImages
          const resolveImgHandle = ca?.resolveImage ?? (resolveImages?.[i] ? resolveImages[i] : undefined);
          const resolveSlot = resolveImgHandle ? imagePool.get(resolveImgHandle.id) : undefined;
          colorAttachments.push({
            view: img.view,
            resolveTarget: resolveSlot?.view,
            loadOp,
            storeOp: resolveStoreOp(ca?.storeAction),
            clearValue: loadOp === "clear"
              ? (ca?.color ? { r: ca.color[0], g: ca.color[1], b: ca.color[2], a: ca.color[3] } : { r: 0, g: 0, b: 0, a: 1 })
              : undefined,
          });
        }
      } else {
        const ca = desc?.colorAttachments?.[0];
        const textureView = context.getCurrentTexture().createView();
        const loadOp = resolveLoadOp(ca?.action);
        const resolveSlot = ca?.resolveImage ? imagePool.get(ca.resolveImage.id) : undefined;
        colorAttachments.push({
          view: textureView,
          resolveTarget: resolveSlot?.view,
          loadOp,
          storeOp: resolveStoreOp(ca?.storeAction),
          clearValue: loadOp === "clear"
            ? (ca?.color ? { r: ca.color[0], g: ca.color[1], b: ca.color[2], a: ca.color[3] } : { r: 0, g: 0, b: 0, a: 1 })
            : undefined,
        });
      }

      // Resolve depth/stencil attachment
      let depthView: GPUTextureView | undefined;
      if (desc?.offscreen?.depthImage) {
        const di = imagePool.get(desc.offscreen.depthImage.id);
        if (!di) throw new Error("Invalid offscreen depth image");
        depthView = di.view;
      } else if (desc?.swapchainDepthImage) {
        const depthSlot = imagePool.get(desc.swapchainDepthImage.id);
        if (!depthSlot) throw new Error("Invalid swapchain depth image");
        depthView = depthSlot.view;
      }

      // Resolve optional timestampWrites
      let gpuTimestampWrites: GPURenderPassTimestampWrites | undefined;
      if (desc?.timestampWrites) {
        const tw = desc.timestampWrites;
        const qsSlot = querySetPool.get(tw.querySet.id);
        if (!qsSlot) throw new Error("Invalid query set handle in timestampWrites");
        gpuTimestampWrites = {
          querySet: qsSlot.gpu,
          beginningOfPassWriteIndex: tw.beginningOfPassWriteIndex,
          endOfPassWriteIndex: tw.endOfPassWriteIndex,
        };
      }

      const passDescGpu: GPURenderPassDescriptor = {
        colorAttachments,
        depthStencilAttachment: depthView ? {
          view: depthView,
          depthLoadOp: resolveLoadOp(desc?.depthAttachment?.action),
          depthStoreOp: resolveStoreOp(desc?.depthAttachment?.storeAction),
          depthClearValue: desc?.depthAttachment?.value ?? 1.0,
          stencilLoadOp: "clear",
          stencilStoreOp: "store",
        } : undefined,
        timestampWrites: gpuTimestampWrites,
      };

      passEncoder = encoder.beginRenderPass(passDescGpu);
      boundVertexBuffers = [];
      boundIndexBuffer = null;
      _frameStats = { drawCalls: 0, totalElements: 0, indirectDrawCalls: 0, dispatchCalls: 0 };
    },

    applyPipeline(pip: SgPipeline) {
      const slot = pipelinePool.get(pip.id);
      if (!slot || !passEncoder) throw new Error("Invalid pipeline or no active pass");
      passEncoder.setPipeline(slot.gpu);
      currentPipeline = slot;
      currentPipelineId = pip.id;
    },

    applyBindings(bind: Bindings) {
      if (!passEncoder) throw new Error("No active pass");
      boundVertexBuffers = [];

      // Vertex buffers
      for (let i = 0; i < bind.vertexBuffers.length; i++) {
        const buf = bufferPool.get(bind.vertexBuffers[i].id);
        if (!buf) throw new Error(`Invalid vertex buffer at index ${i}`);
        passEncoder.setVertexBuffer(i, buf.gpu);
        boundVertexBuffers.push(buf);
      }

      // Index buffer
      if (bind.indexBuffer) {
        const buf = bufferPool.get(bind.indexBuffer.id);
        if (!buf) throw new Error("Invalid index buffer");
        const fmt = currentPipeline?.indexType === IndexType.UINT32 ? "uint32" : "uint16";
        passEncoder.setIndexBuffer(buf.gpu, fmt);
        boundIndexBuffer = buf;
      } else {
        boundIndexBuffer = null;
      }

      // Textures + samplers + storage buffers — bind group 1 (cached)
      const imageHandles = bind.images ?? [];
      const samplerHandles = bind.samplers ?? [];
      const storageBufferHandles = bind.storageBuffers ?? [];
      if (imageHandles.length > 0 || samplerHandles.length > 0 || storageBufferHandles.length > 0) {
        if (!currentPipeline) throw new Error("No active pipeline — call applyPipeline before applyBindings");

        // Build cache key from pipeline id + image ids + sampler ids + storage buffer ids
        const imgIds = imageHandles.map(h => h.id).join(",");
        const smpIds = samplerHandles.map(h => h.id).join(",");
        const sbufIds = storageBufferHandles.map(h => h.id).join(",");
        const cacheKey = `${currentPipelineId}:${imgIds}:${smpIds}:${sbufIds}`;

        let bg = textureSamplerBindGroupCache.get(cacheKey);
        if (!bg) {
          const entries: GPUBindGroupEntry[] = [];
          let binding = 0;
          for (const imgHandle of imageHandles) {
            const img = imagePool.get(imgHandle.id);
            if (!img) throw new Error(`Invalid image handle at texture binding ${binding}`);
            entries.push({ binding: binding++, resource: img.view });
          }
          for (const smpHandle of samplerHandles) {
            const smp = samplerPool.get(smpHandle.id);
            if (!smp) throw new Error(`Invalid sampler handle at sampler binding ${binding}`);
            entries.push({ binding: binding++, resource: smp.gpu });
          }
          for (const sbufHandle of storageBufferHandles) {
            const sbuf = bufferPool.get(sbufHandle.id);
            if (!sbuf) throw new Error(`Invalid storage buffer handle at binding ${binding}`);
            entries.push({ binding: binding++, resource: { buffer: sbuf.gpu } });
          }
          bg = device.createBindGroup({
            layout: currentPipeline.gpu.getBindGroupLayout(1),
            entries,
          });
          textureSamplerBindGroupCache.set(cacheKey, bg);
        }
        passEncoder.setBindGroup(1, bg);
      }
    },

    applyUniforms(data: ArrayBufferView) {
      const activeEncoder = passEncoder ?? computePassEncoder;
      if (!activeEncoder) throw new Error("No active pass");

      // Align to 256 bytes (WebGPU requirement for dynamic offsets)
      const alignedOffset = Math.ceil(uniformOffset / 256) * 256;
      const slotSize = Math.max(data.byteLength, 256);

      // Overflow detection: ensure we don't write past the end of the ring slot
      if (alignedOffset + slotSize > UNIFORM_BUFFER_SIZE) {
        throw new Error(
          `Uniform buffer overflow: offset ${alignedOffset} + ${slotSize} exceeds UNIFORM_BUFFER_SIZE (${UNIFORM_BUFFER_SIZE}). ` +
          `Too many applyUniforms calls in a single frame.`
        );
      }

      const ub = currentUniformBuffer();
      device.queue.writeBuffer(ub, alignedOffset, data.buffer, data.byteOffset, data.byteLength);

      // Use the appropriate bind group based on pass type
      if (computePassEncoder) {
        computePassEncoder.setBindGroup(0, currentComputeUniformBindGroup(), [alignedOffset]);
      } else {
        passEncoder!.setBindGroup(0, currentUniformBindGroup(), [alignedOffset]);
      }

      uniformOffset = alignedOffset + slotSize;
    },

    applyStencilRef(ref: number) {
      if (!passEncoder) throw new Error("No active pass");
      passEncoder.setStencilReference(ref);
    },

    draw(baseElement: number, numElements?: number, numInstances = 1) {
      if (!passEncoder || !currentPipeline) throw new Error("No active pass or pipeline");

      const isIndexed = currentPipeline.indexType !== IndexType.NONE;
      let count = numElements;

      // Auto-derive count from bound buffer size when omitted or zero
      if (count === undefined || count === 0) {
        if (isIndexed && boundIndexBuffer) {
          const bytesPerIndex = currentPipeline.indexType === IndexType.UINT32 ? 4 : 2;
          const bufSize = boundIndexBuffer.desc.size ?? boundIndexBuffer.desc.data?.byteLength ?? 0;
          count = bufSize / bytesPerIndex - baseElement;
        } else if (boundVertexBuffers.length > 0) {
          const stride = currentPipeline.desc.layout.buffers[0]?.stride ?? 0;
          if (stride > 0) {
            const bufSize = boundVertexBuffers[0].desc.size ?? boundVertexBuffers[0].desc.data?.byteLength ?? 0;
            count = bufSize / stride - baseElement;
          } else {
            count = 0;
          }
        } else {
          count = 0;
        }
      }

      // Validate element count vs buffer capacity
      if (isIndexed && boundIndexBuffer) {
        const bytesPerIndex = currentPipeline.indexType === IndexType.UINT32 ? 4 : 2;
        const indexCapacity = (boundIndexBuffer.desc.size ?? boundIndexBuffer.desc.data?.byteLength ?? 0) / bytesPerIndex;
        if (baseElement + count > indexCapacity) {
          throw new Error(`draw: index range [${baseElement}, ${baseElement + count}) exceeds index buffer capacity ${indexCapacity}`);
        }
      } else if (!isIndexed && boundVertexBuffers.length > 0) {
        const stride = currentPipeline.desc.layout.buffers[0]?.stride ?? 0;
        if (stride > 0) {
          const vertexCapacity = (boundVertexBuffers[0].desc.size ?? boundVertexBuffers[0].desc.data?.byteLength ?? 0) / stride;
          if (baseElement + count > vertexCapacity) {
            throw new Error(`draw: vertex range [${baseElement}, ${baseElement + count}) exceeds vertex buffer capacity ${vertexCapacity}`);
          }
        }
      }

      if (isIndexed) {
        passEncoder.drawIndexed(count, numInstances, baseElement);
      } else {
        passEncoder.draw(count, numInstances, baseElement);
      }

      _frameStats.drawCalls++;
      _frameStats.totalElements += count * numInstances;
    },

    drawIndirect(indirectBuffer: SgBuffer, indirectOffset = 0) {
      if (!passEncoder) throw new Error("No active pass");
      const buf = bufferPool.get(indirectBuffer.id);
      if (!buf) throw new Error("Invalid indirect buffer");
      if (currentPipeline?.indexType !== IndexType.NONE) {
        passEncoder.drawIndexedIndirect(buf.gpu, indirectOffset);
      } else {
        passEncoder.drawIndirect(buf.gpu, indirectOffset);
      }
      _frameStats.indirectDrawCalls++;
    },

    beginComputePass(opts?: { label?: string }) {
      if (!encoder) {
        encoder = device.createCommandEncoder();
      }
      computePassEncoder = encoder.beginComputePass({
        label: opts?.label,
      });
      uniformOffset = 0;
    },

    applyComputePipeline(pip: SgPipeline) {
      const slot = computePipelinePool.get(pip.id);
      if (!slot || !computePassEncoder) throw new Error("Invalid compute pipeline or no active compute pass");
      computePassEncoder.setPipeline(slot.gpu);
      currentComputePipeline = slot;
    },

    applyComputeBindings(bind: ComputeBindings) {
      if (!computePassEncoder || !currentComputePipeline) throw new Error("No active compute pass or pipeline");

      const storageHandles = bind.storageBuffers ?? [];
      if (storageHandles.length > 0) {
        if (!currentComputePipeline.storageBindGroupLayout) {
          throw new Error("Compute pipeline has no storage buffer bindings configured");
        }
        const entries: GPUBindGroupEntry[] = [];
        for (let i = 0; i < storageHandles.length; i++) {
          const buf = bufferPool.get(storageHandles[i].id);
          if (!buf) throw new Error(`Invalid storage buffer at binding ${i}`);
          entries.push({ binding: i, resource: { buffer: buf.gpu } });
        }
        const bg = device.createBindGroup({
          layout: currentComputePipeline.storageBindGroupLayout,
          entries,
        });
        // Storage buffers go to group 1 if uniforms are used, group 0 otherwise
        const groupIndex = currentComputePipeline.desc.uniforms ? 1 : 0;
        computePassEncoder.setBindGroup(groupIndex, bg);
      }
    },

    dispatchWorkgroups(x: number, y = 1, z = 1) {
      if (!computePassEncoder) throw new Error("No active compute pass");
      computePassEncoder.dispatchWorkgroups(x, y, z);
      _frameStats.dispatchCalls++;
    },

    dispatchWorkgroupsIndirect(buf: SgBuffer, offsetBytes = 0) {
      if (!computePassEncoder) throw new Error("No active compute pass");
      const slot = bufferPool.get(buf.id);
      if (!slot) throw new Error("Invalid indirect buffer");
      computePassEncoder.dispatchWorkgroupsIndirect(slot.gpu, offsetBytes);
      _frameStats.dispatchCalls++;
    },

    endPass() {
      if (passEncoder) {
        passEncoder.end();
        passEncoder = null;
      }
      if (computePassEncoder) {
        computePassEncoder.end();
        computePassEncoder = null;
        currentComputePipeline = null;
      }
    },

    commit() {
      if (encoder) {
        device.queue.submit([encoder.finish()]);
        encoder = null;
      }
      currentPipeline = null;
      currentPipelineId = 0;
      uniformOffset = 0;

      // Advance the ring buffer index so the next frame writes to a different slot
      uniformFrameIndex = (uniformFrameIndex + 1) % NUM_FRAMES_IN_FLIGHT;

      const now = performance.now();
      frameTime = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      _frameCount++;
    },

    async rebuildPipelinesForShader(shader: SgShader): Promise<void> {
      const deps = shaderPipelineDeps.get(shader.id);
      if (!deps) return;
      // Snapshot the set to avoid issues if deps mutate during async iteration
      // Rebuild all dependent pipelines in parallel for better performance
      await Promise.all([...deps].map(pipId => {
        const slot = pipelinePool.get(pipId);
        if (!slot) return Promise.resolve();
        return rebuildPipeline(pipId, slot);
      }));
    },

    onPipelineRebuilt: undefined,
    onPipelineRebuildError: undefined,
  };

  return gfx;
}
