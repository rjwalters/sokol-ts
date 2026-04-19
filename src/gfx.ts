import {
  type SgBuffer, type SgImage, type SgSampler, type SgShader, type SgPipeline,
  type BufferDesc, type ImageDesc, type SamplerDesc, type ShaderDesc, type PipelineDesc,
  type Bindings, type PassDesc, type Gfx,
  BufferUsage, IndexType, LoadAction, PixelFormat, PrimitiveType, CullMode, CompareFunc,
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
  vertexSource: string;
  fragmentSource: string;
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

  const UNIFORM_BUFFER_SIZE = 65536; // 64KB uniform staging

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
    switch (usage) {
      case BufferUsage.IMMUTABLE:
        // No COPY_DST — data is supplied only at creation via mappedAtCreation
        return GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX;
      case BufferUsage.DYNAMIC:
      case BufferUsage.STREAM:
        return GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX;
      default:
        return GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX;
    }
  }

  const gfx: Gfx = {
    get canvas() { return canvas; },
    get device() { return device; },
    get width() { return canvas.width; },
    get height() { return canvas.height; },
    get dt() { return frameTime; },
    get frameCount() { return _frameCount; },

    makeBuffer(desc: BufferDesc): SgBuffer {
      const h = handle<SgBuffer>("SgBuffer");
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

    makeShader(desc: ShaderDesc): SgShader {
      const h = handle<SgShader>("SgShader");
      const vertexModule = device.createShaderModule({ code: desc.vertexSource, label: desc.label ? `${desc.label}_vs` : undefined });
      const fragmentModule = device.createShaderModule({ code: desc.fragmentSource, label: desc.label ? `${desc.label}_fs` : undefined });
      shaders.set(h.id, { vertexModule, fragmentModule, vertexSource: desc.vertexSource, fragmentSource: desc.fragmentSource });
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
          entryPoint: "vs_main",
          buffers: vertexBuffers,
        },
        fragment: {
          module: shd.fragmentModule,
          entryPoint: "fs_main",
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

    updateBuffer(buf: SgBuffer, data: ArrayBufferView, dstOffset = 0) {
      const slot = buffers.get(buf.id);
      if (!slot) throw new Error("Invalid buffer handle");
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

    beginPass(desc?: PassDesc) {
      encoder = device.createCommandEncoder();

      const colorAttachments: GPURenderPassColorAttachment[] = [];

      if (desc?.offscreen) {
        for (let i = 0; i < desc.offscreen.colorImages.length; i++) {
          const img = images.get(desc.offscreen.colorImages[i].id);
          if (!img) throw new Error("Invalid offscreen color image");
          const ca = desc.colorAttachments?.[i];
          colorAttachments.push({
            view: img.view,
            loadOp: ca?.action === LoadAction.LOAD ? "load" : "clear",
            storeOp: "store",
            clearValue: ca?.color ? { r: ca.color[0], g: ca.color[1], b: ca.color[2], a: ca.color[3] } : { r: 0, g: 0, b: 0, a: 1 },
          });
        }
      } else {
        const ca = desc?.colorAttachments?.[0];
        const textureView = context.getCurrentTexture().createView();
        colorAttachments.push({
          view: textureView,
          loadOp: ca?.action === LoadAction.LOAD ? "load" : "clear",
          storeOp: "store",
          clearValue: ca?.color ? { r: ca.color[0], g: ca.color[1], b: ca.color[2], a: ca.color[3] } : { r: 0, g: 0, b: 0, a: 1 },
        });
      }

      const passDesc: GPURenderPassDescriptor = { colorAttachments };

      passEncoder = encoder.beginRenderPass(passDesc);
      uniformOffset = 0;
    },

    applyPipeline(pip: SgPipeline) {
      const slot = pipelines.get(pip.id);
      if (!slot || !passEncoder) throw new Error("Invalid pipeline or no active pass");
      passEncoder.setPipeline(slot.gpu);
      currentPipeline = slot;
    },

    applyBindings(bind: Bindings) {
      if (!passEncoder) throw new Error("No active pass");
      for (let i = 0; i < bind.vertexBuffers.length; i++) {
        const buf = buffers.get(bind.vertexBuffers[i].id);
        if (!buf) throw new Error(`Invalid vertex buffer at index ${i}`);
        passEncoder.setVertexBuffer(i, buf.gpu);
      }
      if (bind.indexBuffer) {
        const buf = buffers.get(bind.indexBuffer.id);
        if (!buf) throw new Error("Invalid index buffer");
        const fmt = currentPipeline?.indexType === IndexType.UINT32 ? "uint32" : "uint16";
        passEncoder.setIndexBuffer(buf.gpu, fmt);
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

    draw(baseElement: number, numElements: number, numInstances = 1) {
      if (!passEncoder) throw new Error("No active pass");
      if (currentPipeline?.indexType !== IndexType.NONE) {
        passEncoder.drawIndexed(numElements, numInstances, baseElement);
      } else {
        passEncoder.draw(numElements, numInstances, baseElement);
      }
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

      const now = performance.now();
      frameTime = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      _frameCount++;
    },
  };

  return gfx;
}
