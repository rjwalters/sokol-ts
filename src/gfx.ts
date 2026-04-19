import {
  type SgBuffer, type SgImage, type SgSampler, type SgShader, type SgPipeline,
  type BufferDesc, type ImageDesc, type SamplerDesc, type ShaderDesc, type PipelineDesc,
  type Bindings, type PassDesc, type Gfx, type DrawStats,
  BufferUsage, IndexType, LoadAction, StoreAction, PixelFormat, PrimitiveType, CullMode, CompareFunc,
  FilterMode, WrapMode,
} from "./types.js";

let nextId = 1;
function handle<T extends { readonly _brand: string; readonly id: number }>(brand: string): T {
  return { _brand: brand, id: nextId++ } as unknown as T;
}

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
}

interface ShaderSlot {
  vertexModule: GPUShaderModule;
  fragmentModule: GPUShaderModule;
  vertexEntry: string;
  fragmentEntry: string;
}

interface PipelineSlot {
  gpu: GPURenderPipeline;
  desc: PipelineDesc;
  indexType: IndexType;
}

export function createGfx(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
): Gfx {
  const buffers = new Map<number, BufferSlot>();
  const images = new Map<number, ImageSlot>();
  const samplers = new Map<number, SamplerSlot>();
  const shaders = new Map<number, ShaderSlot>();
  const pipelines = new Map<number, PipelineSlot>();

  // Per-frame state
  let encoder: GPUCommandEncoder | null = null;
  let passEncoder: GPURenderPassEncoder | null = null;
  let currentPipeline: PipelineSlot | null = null;
  let frameTime = 0;
  let lastFrameTime = 0;
  let _frameCount = 0;
  let uniformOffset = 0;
  let uniformBuffer: GPUBuffer | null = null;
  let uniformBindGroup: GPUBindGroup | null = null;
  let boundVertexBuffers: BufferSlot[] = [];
  let boundIndexBuffer: BufferSlot | null = null;
  let _frameStats: DrawStats = { drawCalls: 0, totalElements: 0, indirectDrawCalls: 0 };

  const UNIFORM_BUFFER_SIZE = 65536; // 64KB uniform staging
  if (UNIFORM_BUFFER_SIZE > device.limits.maxUniformBufferBindingSize) {
    throw new Error(
      `UNIFORM_BUFFER_SIZE (${UNIFORM_BUFFER_SIZE}) exceeds device limit maxUniformBufferBindingSize (${device.limits.maxUniformBufferBindingSize})`
    );
  }

  function ensureUniformBuffer() {
    if (!uniformBuffer) {
      uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    return uniformBuffer;
  }

  function gpuBufferUsage(usage: BufferUsage | undefined): number {
    const base = GPUBufferUsage.COPY_DST;
    switch (usage) {
      case BufferUsage.INDIRECT:
        return base | GPUBufferUsage.INDIRECT;
      default:
        return base | GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX;
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
      const h = handle<SgBuffer>("SgBuffer");
      const size = desc.data ? desc.data.byteLength : (desc.size ?? 256);
      const gpu = device.createBuffer({
        size,
        usage: gpuBufferUsage(desc.usage),
        mappedAtCreation: !!desc.data,
        label: desc.label,
      });
      if (desc.data) {
        new Uint8Array(gpu.getMappedRange()).set(new Uint8Array(desc.data.buffer, desc.data.byteOffset, desc.data.byteLength));
        gpu.unmap();
      }
      buffers.set(h.id, { gpu, desc });
      return h;
    },

    makeImage(desc: ImageDesc): SgImage {
      const h = handle<SgImage>("SgImage");
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
      images.set(h.id, { texture, view: texture.createView(), desc });
      return h;
    },

    makeSampler(desc: SamplerDesc): SgSampler {
      const h = handle<SgSampler>("SgSampler");
      const gpu = device.createSampler({
        minFilter: desc.minFilter ?? FilterMode.NEAREST,
        magFilter: desc.magFilter ?? FilterMode.NEAREST,
        mipmapFilter: desc.mipmapFilter ?? FilterMode.NEAREST,
        addressModeU: desc.wrapU ?? WrapMode.REPEAT,
        addressModeV: desc.wrapV ?? WrapMode.REPEAT,
        compare: desc.compare as GPUCompareFunction | undefined,
        label: desc.label,
      });
      samplers.set(h.id, { gpu });
      return h;
    },

    async makeShader(desc: ShaderDesc): Promise<SgShader> {
      const h = handle<SgShader>("SgShader");
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
      shaders.set(h.id, { vertexModule, fragmentModule, vertexEntry, fragmentEntry });
      return h;
    },

    makePipeline(desc: PipelineDesc): SgPipeline {
      const h = handle<SgPipeline>("SgPipeline");
      const shd = shaders.get(desc.shader.id);
      if (!shd) throw new Error("Invalid shader handle");

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

      // Group 0: uniform buffer (always present)
      bindGroupLayouts.push(device.createBindGroupLayout({
        entries: [{
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform", hasDynamicOffset: true },
        }],
      }));

      // Group 1: textures + samplers (if any)
      // Users can extend this via custom bind group layouts later

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts,
      });

      const gpuPipeline = device.createRenderPipeline({
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
      });

      pipelines.set(h.id, { gpu: gpuPipeline, desc, indexType: desc.indexType ?? IndexType.NONE });
      return h;
    },

    destroyBuffer(buf: SgBuffer) {
      const slot = buffers.get(buf.id);
      if (slot) { slot.gpu.destroy(); buffers.delete(buf.id); }
    },
    destroyImage(img: SgImage) {
      const slot = images.get(img.id);
      if (slot) { slot.texture.destroy(); images.delete(img.id); }
    },
    destroySampler(smp: SgSampler) { samplers.delete(smp.id); },
    destroyShader(shd: SgShader) { shaders.delete(shd.id); },
    destroyPipeline(pip: SgPipeline) { pipelines.delete(pip.id); },

    updateBuffer(buf: SgBuffer, data: ArrayBufferView) {
      const slot = buffers.get(buf.id);
      if (!slot) throw new Error("Invalid buffer handle");
      device.queue.writeBuffer(slot.gpu, 0, data.buffer, data.byteOffset, data.byteLength);
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
          const img = images.get(desc.offscreen.colorImages[i].id);
          if (!img) throw new Error("Invalid offscreen color image");
          const ca = desc.colorAttachments?.[i];
          const loadOp = resolveLoadOp(ca?.action);
          const resolveSlot = ca?.resolveImage ? images.get(ca.resolveImage.id) : undefined;
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
        const resolveSlot = ca?.resolveImage ? images.get(ca.resolveImage.id) : undefined;
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
        const di = images.get(desc.offscreen.depthImage.id);
        if (!di) throw new Error("Invalid offscreen depth image");
        depthView = di.view;
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
      const slot = pipelines.get(pip.id);
      if (!slot || !passEncoder) throw new Error("Invalid pipeline or no active pass");
      passEncoder.setPipeline(slot.gpu);
      currentPipeline = slot;
    },

    applyBindings(bind: Bindings) {
      if (!passEncoder) throw new Error("No active pass");
      boundVertexBuffers = [];
      for (let i = 0; i < bind.vertexBuffers.length; i++) {
        const buf = buffers.get(bind.vertexBuffers[i].id);
        if (!buf) throw new Error(`Invalid vertex buffer at index ${i}`);
        passEncoder.setVertexBuffer(i, buf.gpu);
        boundVertexBuffers.push(buf);
      }
      if (bind.indexBuffer) {
        const buf = buffers.get(bind.indexBuffer.id);
        if (!buf) throw new Error("Invalid index buffer");
        const fmt = currentPipeline?.indexType === IndexType.UINT32 ? "uint32" : "uint16";
        passEncoder.setIndexBuffer(buf.gpu, fmt);
        boundIndexBuffer = buf;
      } else {
        boundIndexBuffer = null;
      }
    },

    applyUniforms(data: ArrayBufferView) {
      if (!passEncoder) throw new Error("No active pass");
      const ub = ensureUniformBuffer();

      // Align to 256 bytes (WebGPU requirement for dynamic offsets)
      const alignedOffset = Math.ceil(uniformOffset / 256) * 256;
      device.queue.writeBuffer(ub, alignedOffset, data.buffer, data.byteOffset, data.byteLength);

      uniformBindGroup = device.createBindGroup({
        layout: currentPipeline!.gpu.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: ub, size: Math.max(data.byteLength, 256) } }],
      });
      passEncoder.setBindGroup(0, uniformBindGroup, [alignedOffset]);

      uniformOffset = alignedOffset + Math.max(data.byteLength, 256);
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
      const buf = buffers.get(indirectBuffer.id);
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
      uniformBindGroup = null;
      uniformOffset = 0;

      const now = performance.now();
      frameTime = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      _frameCount++;
    },
  };

  return gfx;
}
