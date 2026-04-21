# sokol-ts

A lightweight WebGPU graphics library for TypeScript, inspired by the [Sokol](https://github.com/floooh/sokol) C headers.

sokol-ts wraps the WebGPU API in a thin, Sokol-style interface: branded resource handles, descriptor-based creation, and a simple `beginPass / applyPipeline / draw / endPass / commit` render loop. No build-time code generation, no heavyweight abstractions -- just typed functions over a GPU device.

## Modules

| Module | Import | Description |
|--------|--------|-------------|
| **app** | `run(desc)` | Canvas setup, WebGPU init, input events, frame loop |
| **gfx** | `createGfx(...)` | Resource creation (buffers, images, shaders, pipelines), draw commands, bind group & pipeline caching |
| **stm** | `createStm()` | High-precision timing (mirrors `sokol_time.h`) |
| **audio** | `createAudio(desc)` | Callback-driven audio via AudioWorklet (mirrors `sokol_audio.h`) |
| **fetch** | `createSfetch(gfx)` | Async asset loading for images, shaders, and binary data |
| **debugText** | `createDebugText(gfx)` | 8x8 bitmap font debug text overlay |
| **hmr** | `runWithHMR(desc)` | Vite HMR integration with optional state serialization |

## Quick Start

```bash
npm install sokol-ts
```

```typescript
import { run, LoadAction, VertexFormat } from "sokol-ts";

run({
  canvas: "#canvas",
  async init(gfx) {
    const vb = gfx.makeBuffer({ data: new Float32Array([...]) });
    const shader = await gfx.makeShader({ source: wgslSource });
    const pip = gfx.makePipeline({
      shader,
      layout: {
        buffers: [{ stride: 20 }],
        attrs: [
          { shaderLocation: 0, format: VertexFormat.FLOAT2, offset: 0 },
          { shaderLocation: 1, format: VertexFormat.FLOAT3, offset: 8 },
        ],
      },
    });
  },
  frame(gfx) {
    gfx.beginPass({
      colorAttachments: [{ action: LoadAction.CLEAR, color: [0.1, 0.1, 0.1, 1] }],
    });
    gfx.applyPipeline(pip);
    gfx.applyBindings({ vertexBuffers: [vb] });
    gfx.draw(0, 3);
    gfx.endPass();
    gfx.commit();
  },
});
```

## Examples

Run any example with Vite:

```bash
npm run dev                       # cube (default)
npx vite examples/triangle        # hello triangle
npx vite examples/instancing      # 64 instanced triangles
```

| Example | What it shows |
|---------|---------------|
| [triangle](examples/triangle/) | Minimal vertex buffer + WGSL shader |
| [instancing](examples/instancing/) | Per-instance attributes, step mode |
| [cube](examples/cube/) | Depth buffer, index buffer, MVP uniforms, resize handling |

## Features

- **Branded resource handles** -- `SgBuffer`, `SgImage`, `SgShader`, `SgPipeline`, `SgSampler` with generation-counted IDs for use-after-free detection
- **Pool-based resource management** with automatic slot recycling
- **Ring-buffered uniforms** with 256-byte aligned double buffering
- **Bind group and pipeline caching** for zero-allocation hot paths
- **Configurable blend, stencil, and MSAA** support
- **Mipmap generation** with 2D, array, and cube texture support
- **Compressed texture formats** (BC, ETC2, ASTC)
- **Async shader compilation** with hot-reload via `rebuildPipeline()`
- **Input events** -- keyboard, mouse, touch, pointer lock, gamepad, drag-drop, DPI change detection
- **High-precision timing** -- lap timer, delta, rolling averages
- **Callback-driven audio** via AudioWorklet
- **Asset fetching** with progress callbacks and split vertex/fragment shader loading
- **Debug text overlay** with printf-style formatting
- **Vite HMR** -- live reload with serializable state

## Gotchas

### Handle lifetime is manual

`makeBuffer()`, `makeImage()`, `makeSampler()`, `makeShader()`, and `makePipeline()` each allocate a slot in a fixed-size pool (64 to 128 entries depending on resource type). These slots are **not** garbage-collected -- you must call the matching `destroy*()` method when a resource is no longer needed. Leaking handles eventually exhausts the pool, which throws at runtime. `shutdown()` destroys all live resources and logs warnings for any that were not explicitly released, but relying on shutdown for cleanup is not a substitute for proper lifetime management.

```typescript
const buf = gfx.makeBuffer({ data: vertices });
// ... use buf ...
gfx.destroyBuffer(buf); // free the pool slot and GPU memory
```

### Uniform buffer 256-byte alignment

Each `applyUniforms(data)` call writes into a shared 64 KB ring buffer that is reset every frame. Writes are aligned to 256-byte boundaries (the WebGPU `minUniformBufferOffsetAlignment` requirement), so every call reserves at least 256 bytes regardless of the actual data size. This means at most 256 uniform calls can fit in a single frame (`65 536 / 256 = 256`). If you exceed this budget the library will throw. Keep uniform data small and batch where possible.

## Development

```bash
npm install
npm run lint            # type-check (tsc --noEmit)
npm test                # unit tests (vitest)
npm run test:e2e        # e2e tests (playwright -- renders all examples in Chromium)
npm run build           # emit to dist/
npm run docs            # generate TypeDoc API docs
```

## Requirements

- **Runtime**: A browser with [WebGPU support](https://caniuse.com/webgpu) (Chrome 113+, Edge 113+, Firefox Nightly, Safari 18+)
- **Build**: Node >= 18, TypeScript >= 5
- **Peer dependency**: `@webgpu/types >= 0.1`

## Built with Loom

This library was developed using [Loom](https://github.com/rjwalters/loom), an AI-powered development orchestration system. Loom managed the full lifecycle -- issue decomposition, parallel agent builds, automated code review, and merge coordination -- across 38 PRs.

## License

[MIT](LICENSE)
