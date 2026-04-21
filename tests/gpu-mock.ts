/**
 * Lightweight GPU mock objects for unit testing gfx.ts through
 * the public createGfx() API.
 *
 * These mocks satisfy the GPUDevice / GPUCanvasContext / HTMLCanvasElement
 * shapes that createGfx() needs, without requiring a real WebGPU backend.
 */

// WebGPU constant polyfills are loaded via tests/webgpu-polyfill.ts (vitest setup file).

// ---------------------------------------------------------------------------
// Mock GPU buffer
// ---------------------------------------------------------------------------

let bufferIdCounter = 0;

class MockGPUBuffer {
  readonly id = ++bufferIdCounter;
  readonly size: number;
  readonly usage: number;
  readonly label?: string;
  private mapped: ArrayBuffer | null;
  destroyed = false;

  constructor(desc: { size: number; usage: number; mappedAtCreation?: boolean; label?: string }) {
    this.size = desc.size;
    this.usage = desc.usage;
    this.label = desc.label;
    this.mapped = desc.mappedAtCreation ? new ArrayBuffer(desc.size) : null;
  }

  getMappedRange(): ArrayBuffer {
    if (!this.mapped) throw new Error("Buffer is not mapped");
    return this.mapped;
  }

  unmap(): void {
    this.mapped = null;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

// ---------------------------------------------------------------------------
// Mock GPU texture
// ---------------------------------------------------------------------------

class MockGPUTextureView {
  readonly label?: string;
  constructor(label?: string) { this.label = label; }
}

class MockGPUTexture {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly label?: string;
  destroyed = false;

  constructor(desc: GPUTextureDescriptor) {
    const size = desc.size as { width: number; height: number };
    this.width = size.width;
    this.height = size.height;
    this.format = desc.format;
    this.label = desc.label;
  }

  createView(_desc?: GPUTextureViewDescriptor): MockGPUTextureView {
    return new MockGPUTextureView(this.label);
  }

  destroy(): void {
    this.destroyed = true;
  }
}

// ---------------------------------------------------------------------------
// Mock GPU sampler
// ---------------------------------------------------------------------------

class MockGPUSampler {
  readonly label?: string;
  constructor(desc?: GPUSamplerDescriptor) { this.label = desc?.label; }
}

// ---------------------------------------------------------------------------
// Mock GPU shader module
// ---------------------------------------------------------------------------

class MockGPUShaderModule {
  readonly code: string;
  readonly label?: string;
  constructor(desc: GPUShaderModuleDescriptor) {
    this.code = desc.code;
    this.label = desc.label;
  }

  async getCompilationInfo(): Promise<GPUCompilationInfo> {
    return { messages: [] };
  }
}

// ---------------------------------------------------------------------------
// Mock GPU bind group layout / bind group / pipeline layout
// ---------------------------------------------------------------------------

class MockGPUBindGroupLayout {
  readonly entries: readonly GPUBindGroupLayoutEntry[];
  constructor(desc: GPUBindGroupLayoutDescriptor) { this.entries = desc.entries; }
}

class MockGPUBindGroup {
  readonly layout: MockGPUBindGroupLayout;
  constructor(desc: GPUBindGroupDescriptor) {
    this.layout = desc.layout as unknown as MockGPUBindGroupLayout;
  }
}

class MockGPUPipelineLayout {
  constructor(_desc: GPUPipelineLayoutDescriptor) {}
}

// ---------------------------------------------------------------------------
// Mock GPU render pipeline
// ---------------------------------------------------------------------------

let pipelineIdCounter = 0;

class MockGPURenderPipeline {
  readonly id = ++pipelineIdCounter;
  private bindGroupLayouts: MockGPUBindGroupLayout[];

  constructor(_desc: GPURenderPipelineDescriptor) {
    this.bindGroupLayouts = [];
  }

  getBindGroupLayout(index: number): MockGPUBindGroupLayout {
    while (this.bindGroupLayouts.length <= index) {
      this.bindGroupLayouts.push(new MockGPUBindGroupLayout({ entries: [] }));
    }
    return this.bindGroupLayouts[index];
  }
}

// ---------------------------------------------------------------------------
// Mock GPU query set
// ---------------------------------------------------------------------------

class MockGPUQuerySet {
  readonly type: string;
  readonly count: number;
  readonly label?: string;
  destroyed = false;

  constructor(desc: GPUQuerySetDescriptor) {
    this.type = desc.type;
    this.count = desc.count;
    this.label = desc.label;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

// ---------------------------------------------------------------------------
// Mock GPU render pass encoder
// ---------------------------------------------------------------------------

class MockGPURenderPassEncoder {
  ended = false;
  setPipeline(_pipeline: MockGPURenderPipeline): void {}
  setVertexBuffer(_slot: number, _buffer: MockGPUBuffer): void {}
  setIndexBuffer(_buffer: MockGPUBuffer, _format: string): void {}
  setBindGroup(_index: number, _bindGroup: MockGPUBindGroup, _offsets?: number[]): void {}
  setStencilReference(_ref: number): void {}
  draw(_vertexCount: number, _instanceCount?: number, _firstVertex?: number): void {}
  drawIndexed(_indexCount: number, _instanceCount?: number, _firstIndex?: number): void {}
  drawIndirect(_buffer: MockGPUBuffer, _offset: number): void {}
  drawIndexedIndirect(_buffer: MockGPUBuffer, _offset: number): void {}
  end(): void { this.ended = true; }
}

// ---------------------------------------------------------------------------
// Mock GPU command encoder
// ---------------------------------------------------------------------------

class MockGPUCommandEncoder {
  /** Tracks resolveQuerySet calls for test assertions. */
  resolveQuerySetCalls: Array<{
    querySet: MockGPUQuerySet;
    firstQuery: number;
    queryCount: number;
    destination: MockGPUBuffer;
    destinationOffset: number;
  }> = [];
  /** Tracks the last render pass descriptor for test assertions. */
  lastRenderPassDesc: GPURenderPassDescriptor | null = null;

  beginRenderPass(desc: GPURenderPassDescriptor): MockGPURenderPassEncoder {
    this.lastRenderPassDesc = desc;
    return new MockGPURenderPassEncoder();
  }
  resolveQuerySet(
    querySet: MockGPUQuerySet,
    firstQuery: number,
    queryCount: number,
    destination: MockGPUBuffer,
    destinationOffset: number,
  ): void {
    this.resolveQuerySetCalls.push({ querySet, firstQuery, queryCount, destination, destinationOffset });
  }
  finish(): MockGPUCommandBuffer {
    return new MockGPUCommandBuffer();
  }
}

class MockGPUCommandBuffer {}

// ---------------------------------------------------------------------------
// Mock GPU queue
// ---------------------------------------------------------------------------

class MockGPUQueue {
  submit(_commandBuffers: MockGPUCommandBuffer[]): void {}
  writeBuffer(
    _buffer: MockGPUBuffer,
    _offset: number,
    _data: ArrayBuffer,
    _dataOffset?: number,
    _size?: number,
  ): void {}
  writeTexture(
    _destination: GPUTexelCopyTextureInfo,
    _data: ArrayBufferView | ArrayBuffer,
    _dataLayout: GPUTexelCopyBufferLayout,
    _size: GPUExtent3DStrict,
  ): void {}
  copyExternalImageToTexture(
    _source: GPUCopyExternalImageSourceInfo,
    _destination: GPUCopyExternalImageDestInfo,
    _copySize: GPUExtent3DStrict,
  ): void {}
}

// ---------------------------------------------------------------------------
// Mock GPUDevice
// ---------------------------------------------------------------------------

export function createMockDevice(): GPUDevice & { _lastEncoder: MockGPUCommandEncoder | null } {
  const queue = new MockGPUQueue();

  const device = {
    queue,
    _lastEncoder: null as MockGPUCommandEncoder | null,
    features: new Set<string>(),
    limits: {
      maxUniformBufferBindingSize: 65536,
    },
    createBuffer(desc: GPUBufferDescriptor): MockGPUBuffer {
      return new MockGPUBuffer(desc as { size: number; usage: number; mappedAtCreation?: boolean; label?: string });
    },
    createTexture(desc: GPUTextureDescriptor): MockGPUTexture {
      return new MockGPUTexture(desc);
    },
    createSampler(desc?: GPUSamplerDescriptor): MockGPUSampler {
      return new MockGPUSampler(desc);
    },
    createShaderModule(desc: GPUShaderModuleDescriptor): MockGPUShaderModule {
      return new MockGPUShaderModule(desc);
    },
    createBindGroupLayout(desc: GPUBindGroupLayoutDescriptor): MockGPUBindGroupLayout {
      return new MockGPUBindGroupLayout(desc);
    },
    createBindGroup(desc: GPUBindGroupDescriptor): MockGPUBindGroup {
      return new MockGPUBindGroup(desc);
    },
    createPipelineLayout(desc: GPUPipelineLayoutDescriptor): MockGPUPipelineLayout {
      return new MockGPUPipelineLayout(desc);
    },
    createRenderPipeline(desc: GPURenderPipelineDescriptor): MockGPURenderPipeline {
      return new MockGPURenderPipeline(desc);
    },
    async createRenderPipelineAsync(desc: GPURenderPipelineDescriptor): Promise<MockGPURenderPipeline> {
      return new MockGPURenderPipeline(desc);
    },
    createQuerySet(desc: GPUQuerySetDescriptor): MockGPUQuerySet {
      return new MockGPUQuerySet(desc);
    },
    createCommandEncoder(_desc?: GPUCommandEncoderDescriptor): MockGPUCommandEncoder {
      const enc = new MockGPUCommandEncoder();
      device._lastEncoder = enc;
      return enc;
    },
  } as unknown as GPUDevice & { _lastEncoder: MockGPUCommandEncoder | null };

  return device;
}

// ---------------------------------------------------------------------------
// Mock HTMLCanvasElement
// ---------------------------------------------------------------------------

export function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
  } as unknown as HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// Mock GPUCanvasContext
// ---------------------------------------------------------------------------

export function createMockContext(): GPUCanvasContext {
  return {
    getCurrentTexture(): MockGPUTexture {
      return new MockGPUTexture({
        size: { width: 800, height: 600 },
        format: "bgra8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    },
  } as unknown as GPUCanvasContext;
}

// ---------------------------------------------------------------------------
// Convenience: create all three mock objects at once
// ---------------------------------------------------------------------------

export function createMockGfxDeps() {
  return {
    device: createMockDevice(),
    canvas: createMockCanvas(),
    context: createMockContext(),
    format: "bgra8unorm" as GPUTextureFormat,
  };
}
