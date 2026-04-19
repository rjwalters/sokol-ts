import {
  type SgBuffer, type SgImage, type SgSampler, type SgShader, type SgPipeline,
  type BufferDesc, type ImageDesc, type SamplerDesc, type ShaderDesc, type PipelineDesc,
  type Bindings, type PassDesc, type Gfx, type Handle, type DrawStats, type ShaderRecompileResult,
  BufferUsage, IndexType, LoadAction, StoreAction, PixelFormat, PrimitiveType, CullMode, CompareFunc,
  FilterMode, WrapMode,
} from "./types.js";

/** Number of uniform ring-buffer slots to prevent CPU/GPU aliasing. */
export const NUM_FRAMES_IN_FLIGHT = 2;

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

export function createGfx(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
): Gfx {
  const bufferPool   = new Pool<BufferSlot>(128);
  const imagePool    = new Pool<ImageSlot>(128);
  const samplerPool  = new Pool<SamplerSlot>(64);
  const shaderPool   = new Pool<ShaderSlot>(64);
  const pipelinePool = new Pool<PipelineSlot>(64);
  // shader handle id -> set of pipeline handle ids that reference it
  const shaderPipelineDeps = new Map<number, Set<number>>();

  // Per-frame state
  let encoder: GPUCommandEncoder | null = null;
  let passEncoder: GPURenderPassEncoder | null = null;
  let currentPipeline: PipelineSlot | null = null;
  let frameTime = 0;
  let lastFrameTime = 0;
  let _frameCount = 0;
  let uniformOffset = 0;
  let boundVertexBuffers: BufferSlot[] = [];
  let boundIndexBuffer: BufferSlot | null = null;
  let _frameStats: DrawStats = { drawCalls: 0, totalElements: 0, indirectDrawCalls: 0 };

  const UNIFORM_BUFFER_SIZE = 65536; // 64KB uniform staging per ring slot
  if (UNIFORM_BUFFER_SIZE > device.limits.maxUniformBufferBindingSize) {
    throw new Error(
      `UNIFORM_BUFFER_SIZE (${UNIFORM_BUFFER_SIZE}) exceeds device limit maxUniformBufferBindingSize (${device.limits.maxUniformBufferBindingSize})`
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
      entries: [{ binding: 0, resource: { buffer: buf, size: UNIFORM_BUFFER_SIZE } }],
      label: `uniform_bind_group_${i}`,
    }));
  }

  function currentUniformBuffer() {
    return uniformBuffers[uniformFrameIndex];
  }

  function currentUniformBindGroup() {
    return uniformBindGroups[uniformFrameIndex];
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
      const pipHandle: SgPipeline = { _brand: "SgPipeline", id: pipId } as SgPipeline;
      gfx.onPipelineRebuilt?.(pipHandle);
    } catch (err) {
      console.warn(`[sokol-ts] Pipeline ${pipId} rebuild failed, keeping old pipeline:`, err);
      const pipHandle: SgPipeline = { _brand: "SgPipeline", id: pipId } as SgPipeline;
      gfx.onPipelineRebuildError?.(pipHandle, err);
    }
  }

  // ---------------------------------------------------------------------------

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
      let usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
      if (desc.renderTarget) {
        usage |= GPUTextureUsage.RENDER_ATTACHMENT;
      }
      const texture = device.createTexture({
        size: { width: desc.width, height: desc.height },
        format: fmt,
        usage,
        sampleCount: desc.sampleCount ?? 1,
        label: desc.label,
      });
      if (desc.data) {
        device.queue.writeTexture(
          { texture },
          desc.data,
          { bytesPerRow: desc.width * 4 },
          { width: desc.width, height: desc.height },
        );
      }
      imagePool.set(id, { texture, view: texture.createView(), desc });
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
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        } as GPUBlendState : undefined,
      }));

      const bindGroupLayouts: GPUBindGroupLayout[] = [];

      // Group 0: uniform buffer (always present) — reuse the shared layout
      bindGroupLayouts.push(uniformBindGroupLayout);

      // Group 1: textures + samplers (if any)
      // Texture bindings occupy locations 0..images-1;
      // sampler bindings occupy locations images..images+samplerCount-1.
      const imageCount = desc.images ?? 0;
      const samplerCount = desc.samplerCount ?? 0;
      if (imageCount > 0 || samplerCount > 0) {
        const group1Entries: GPUBindGroupLayoutEntry[] = [];
        for (let i = 0; i < imageCount; i++) {
          group1Entries.push({
            binding: i,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {},
          });
        }
        for (let i = 0; i < samplerCount; i++) {
          group1Entries.push({
            binding: imageCount + i,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {},
          });
        }
        bindGroupLayouts.push(device.createBindGroupLayout({ entries: group1Entries }));
      }

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts,
      });

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
        } : undefined,
        multisample: { count: desc.multisample?.count ?? 1 },
        label: desc.label,
      };

      const gpuPipeline = device.createRenderPipeline(gpuPipelineDesc);

      pipelinePool.set(id, { gpu: gpuPipeline, desc, gpuDesc: gpuPipelineDesc, indexType: desc.indexType ?? IndexType.NONE });

      // Track shader -> pipeline dependency for hot-reload rebuilding
      const deps = shaderPipelineDeps.get(desc.shader.id) ?? new Set<number>();
      deps.add(id);
      shaderPipelineDeps.set(desc.shader.id, deps);

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
      const slot = bufferPool.free(buf.id);
      if (slot) slot.gpu.destroy();
    },
    destroyImage(img: SgImage) {
      const slot = imagePool.free(img.id);
      if (slot) slot.texture.destroy();
    },
    destroySampler(smp: SgSampler) { samplerPool.free(smp.id); },
    destroyShader(shd: SgShader) { shaderPool.free(shd.id); },
    destroyPipeline(pip: SgPipeline) {
      const slot = pipelinePool.get(pip.id);
      if (slot) {
        const deps = shaderPipelineDeps.get(slot.desc.shader.id);
        deps?.delete(pip.id);
        // Prune empty dep sets to avoid memory leaks
        if (deps && deps.size === 0) {
          shaderPipelineDeps.delete(slot.desc.shader.id);
        }
      }
      pipelinePool.free(pip.id);
    },

    isValid(handle: Handle): boolean {
      switch (handle._brand) {
        case "SgBuffer":   return bufferPool.get(handle.id)   !== undefined;
        case "SgImage":    return imagePool.get(handle.id)    !== undefined;
        case "SgSampler":  return samplerPool.get(handle.id)  !== undefined;
        case "SgShader":   return shaderPool.get(handle.id)   !== undefined;
        case "SgPipeline": return pipelinePool.get(handle.id) !== undefined;
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

    shutdown() {
      for (const slot of bufferPool.liveResources())  { slot.gpu.destroy(); }
      for (const slot of imagePool.liveResources())   { slot.texture.destroy(); }
      // samplers, shaders, pipelines have no GPU destroy call

      const leakedBuffers   = bufferPool.liveResources();
      const leakedImages    = imagePool.liveResources();
      const leakedSamplers  = samplerPool.liveResources();
      const leakedShaders   = shaderPool.liveResources();
      const leakedPipelines = pipelinePool.liveResources();

      const leaked = leakedBuffers.length + leakedImages.length +
                     leakedSamplers.length + leakedShaders.length + leakedPipelines.length;
      if (leaked > 0) {
        const labels: string[] = [];
        for (const s of leakedBuffers)   { if (s.desc.label)   labels.push(s.desc.label); }
        for (const s of leakedImages)    { if (s.desc.label)   labels.push(s.desc.label); }
        for (const s of leakedPipelines) { if (s.desc.label)   labels.push(s.desc.label); }
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
        for (let i = 0; i < desc.offscreen.colorImages.length; i++) {
          const img = imagePool.get(desc.offscreen.colorImages[i].id);
          if (!img) throw new Error("Invalid offscreen color image");
          const ca = desc.colorAttachments?.[i];
          const loadOp = resolveLoadOp(ca?.action);
          const resolveSlot = ca?.resolveImage ? imagePool.get(ca.resolveImage.id) : undefined;
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
      };

      passEncoder = encoder.beginRenderPass(passDescGpu);
      uniformOffset = 0;
      boundVertexBuffers = [];
      boundIndexBuffer = null;
      _frameStats = { drawCalls: 0, totalElements: 0, indirectDrawCalls: 0 };
    },

    applyPipeline(pip: SgPipeline) {
      const slot = pipelinePool.get(pip.id);
      if (!slot || !passEncoder) throw new Error("Invalid pipeline or no active pass");
      passEncoder.setPipeline(slot.gpu);
      currentPipeline = slot;
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

      // Textures + samplers — bind group 1
      const imageHandles = bind.images ?? [];
      const samplerHandles = bind.samplers ?? [];
      if (imageHandles.length > 0 || samplerHandles.length > 0) {
        if (!currentPipeline) throw new Error("No active pipeline — call applyPipeline before applyBindings");
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
        const bg = device.createBindGroup({
          layout: currentPipeline.gpu.getBindGroupLayout(1),
          entries,
        });
        passEncoder.setBindGroup(1, bg);
      }
    },

    applyUniforms(data: ArrayBufferView) {
      if (!passEncoder) throw new Error("No active pass");

      // Align to 256 bytes (WebGPU requirement for dynamic offsets)
      const alignedOffset = Math.ceil(uniformOffset / 256) * 256;
      const slotSize = Math.max(data.byteLength, 256);

      // Overflow detection: ensure we don't write past the end of the ring slot
      if (alignedOffset + slotSize > UNIFORM_BUFFER_SIZE) {
        throw new Error(
          `Uniform buffer overflow: offset ${alignedOffset} + ${slotSize} exceeds UNIFORM_BUFFER_SIZE (${UNIFORM_BUFFER_SIZE}). ` +
          `Too many applyUniforms calls in a single pass.`
        );
      }

      const ub = currentUniformBuffer();
      device.queue.writeBuffer(ub, alignedOffset, data.buffer, data.byteOffset, data.byteLength);

      // Use the pre-created bind group for this ring slot; supply the dynamic offset
      passEncoder.setBindGroup(0, currentUniformBindGroup(), [alignedOffset]);

      uniformOffset = alignedOffset + slotSize;
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

    endPass() {
      if (passEncoder) {
        passEncoder.end();
        passEncoder = null;
      }
    },

    commit() {
      if (encoder) {
        device.queue.submit([encoder.finish()]);
        encoder = null;
      }
      currentPipeline = null;
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
