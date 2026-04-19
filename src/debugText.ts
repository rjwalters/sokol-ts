/**
 * debugText.ts — sokol_debugtext equivalent for sokol-ts
 *
 * Creates a self-contained debug text renderer that overlays pixel-coordinate
 * text onto an existing WebGPU scene. Uses an embedded 8×8 bitmap font atlas
 * and batches all print() calls into a single draw call per draw() invocation.
 *
 * Usage:
 *   const dt = createDebugText(gfx);
 *   // in frame():
 *   dt.print(10, 10, "Hello World!");
 *   dt.printf(10, 20, "FPS: %.1f", 1 / gfx.dt);
 *   dt.draw(gfx);   // overlays on existing scene, resets state
 */

import {
  type Gfx,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DebugTextDesc {
  /** Maximum characters that can be printed per frame. Default: 8192 */
  maxChars?: number;
  /** Coordinate origin. Default: "top-left" */
  origin?: "top-left" | "bottom-left";
}

export interface DebugText {
  /** Print text at pixel position (x, y) with an optional RGBA color override. */
  print(x: number, y: number, text: string, color?: [number, number, number, number]): void;
  /** printf-style helper — thin wrapper around print(). Supports %s %d %i %f %e %E %g %G %.Nf %%. */
  printf(x: number, y: number, fmt: string, ...args: unknown[]): void;
  /** Set the default color for subsequent print() calls. Components in [0, 1]. */
  setColor(r: number, g: number, b: number, a?: number): void;
  /** Set glyph scale multiplier (default 1 = 8×8 px per glyph). */
  setScale(s: number): void;
  /**
   * Flush all accumulated character quads as a single overlaid draw call,
   * then reset the per-frame state. Must be called after gfx.endPass() / before
   * gfx.commit() — or as a standalone pass.
   */
  draw(gfx: Gfx): void;
  /** Release all GPU resources owned by this module. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Built-in 8×8 bitmap font — 95 printable ASCII chars (0x20 space … 0x7E ~)
// Each glyph = 8 bytes (one byte per row, MSB = leftmost pixel).
// ---------------------------------------------------------------------------

// prettier-ignore
const FONT_DATA = new Uint8Array([
  // 0x20 ' '
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
  // 0x21 '!'
  0x18,0x3C,0x3C,0x18,0x18,0x00,0x18,0x00,
  // 0x22 '"'
  0x36,0x36,0x00,0x00,0x00,0x00,0x00,0x00,
  // 0x23 '#'
  0x36,0x36,0x7F,0x36,0x7F,0x36,0x36,0x00,
  // 0x24 '$'
  0x0C,0x3E,0x03,0x1E,0x30,0x1F,0x0C,0x00,
  // 0x25 '%'
  0x00,0x63,0x33,0x18,0x0C,0x66,0x63,0x00,
  // 0x26 '&'
  0x1C,0x36,0x1C,0x6E,0x3B,0x33,0x6E,0x00,
  // 0x27 "'"
  0x06,0x06,0x03,0x00,0x00,0x00,0x00,0x00,
  // 0x28 '('
  0x18,0x0C,0x06,0x06,0x06,0x0C,0x18,0x00,
  // 0x29 ')'
  0x06,0x0C,0x18,0x18,0x18,0x0C,0x06,0x00,
  // 0x2A '*'
  0x00,0x66,0x3C,0xFF,0x3C,0x66,0x00,0x00,
  // 0x2B '+'
  0x00,0x0C,0x0C,0x3F,0x0C,0x0C,0x00,0x00,
  // 0x2C ','
  0x00,0x00,0x00,0x00,0x00,0x0C,0x0C,0x06,
  // 0x2D '-'
  0x00,0x00,0x00,0x3F,0x00,0x00,0x00,0x00,
  // 0x2E '.'
  0x00,0x00,0x00,0x00,0x00,0x0C,0x0C,0x00,
  // 0x2F '/'
  0x60,0x30,0x18,0x0C,0x06,0x03,0x01,0x00,
  // 0x30 '0'
  0x3E,0x63,0x73,0x7B,0x6F,0x67,0x3E,0x00,
  // 0x31 '1'
  0x0C,0x0E,0x0C,0x0C,0x0C,0x0C,0x3F,0x00,
  // 0x32 '2'
  0x1E,0x33,0x30,0x1C,0x06,0x33,0x3F,0x00,
  // 0x33 '3'
  0x1E,0x33,0x30,0x1C,0x30,0x33,0x1E,0x00,
  // 0x34 '4'
  0x38,0x3C,0x36,0x33,0x7F,0x30,0x78,0x00,
  // 0x35 '5'
  0x3F,0x03,0x1F,0x30,0x30,0x33,0x1E,0x00,
  // 0x36 '6'
  0x1C,0x06,0x03,0x1F,0x33,0x33,0x1E,0x00,
  // 0x37 '7'
  0x3F,0x33,0x30,0x18,0x0C,0x0C,0x0C,0x00,
  // 0x38 '8'
  0x1E,0x33,0x33,0x1E,0x33,0x33,0x1E,0x00,
  // 0x39 '9'
  0x1E,0x33,0x33,0x3E,0x30,0x18,0x0E,0x00,
  // 0x3A ':'
  0x00,0x0C,0x0C,0x00,0x00,0x0C,0x0C,0x00,
  // 0x3B ';'
  0x00,0x0C,0x0C,0x00,0x00,0x0C,0x0C,0x06,
  // 0x3C '<'
  0x18,0x0C,0x06,0x03,0x06,0x0C,0x18,0x00,
  // 0x3D '='
  0x00,0x00,0x3F,0x00,0x00,0x3F,0x00,0x00,
  // 0x3E '>'
  0x06,0x0C,0x18,0x30,0x18,0x0C,0x06,0x00,
  // 0x3F '?'
  0x1E,0x33,0x30,0x18,0x0C,0x00,0x0C,0x00,
  // 0x40 '@'
  0x3E,0x63,0x7B,0x7B,0x7B,0x03,0x1E,0x00,
  // 0x41 'A'
  0x0C,0x1E,0x33,0x33,0x3F,0x33,0x33,0x00,
  // 0x42 'B'
  0x3F,0x66,0x66,0x3E,0x66,0x66,0x3F,0x00,
  // 0x43 'C'
  0x3C,0x66,0x03,0x03,0x03,0x66,0x3C,0x00,
  // 0x44 'D'
  0x1F,0x36,0x66,0x66,0x66,0x36,0x1F,0x00,
  // 0x45 'E'
  0x7F,0x46,0x16,0x1E,0x16,0x46,0x7F,0x00,
  // 0x46 'F'
  0x7F,0x46,0x16,0x1E,0x16,0x06,0x0F,0x00,
  // 0x47 'G'
  0x3C,0x66,0x03,0x03,0x73,0x66,0x7C,0x00,
  // 0x48 'H'
  0x33,0x33,0x33,0x3F,0x33,0x33,0x33,0x00,
  // 0x49 'I'
  0x1E,0x0C,0x0C,0x0C,0x0C,0x0C,0x1E,0x00,
  // 0x4A 'J'
  0x78,0x30,0x30,0x30,0x33,0x33,0x1E,0x00,
  // 0x4B 'K'
  0x67,0x66,0x36,0x1E,0x36,0x66,0x67,0x00,
  // 0x4C 'L'
  0x0F,0x06,0x06,0x06,0x46,0x66,0x7F,0x00,
  // 0x4D 'M'
  0x63,0x77,0x7F,0x7F,0x6B,0x63,0x63,0x00,
  // 0x4E 'N'
  0x63,0x67,0x6F,0x7B,0x73,0x63,0x63,0x00,
  // 0x4F 'O'
  0x1C,0x36,0x63,0x63,0x63,0x36,0x1C,0x00,
  // 0x50 'P'
  0x3F,0x66,0x66,0x3E,0x06,0x06,0x0F,0x00,
  // 0x51 'Q'
  0x1E,0x33,0x33,0x33,0x3B,0x1E,0x38,0x00,
  // 0x52 'R'
  0x3F,0x66,0x66,0x3E,0x36,0x66,0x67,0x00,
  // 0x53 'S'
  0x1E,0x33,0x07,0x0E,0x38,0x33,0x1E,0x00,
  // 0x54 'T'
  0x3F,0x2D,0x0C,0x0C,0x0C,0x0C,0x1E,0x00,
  // 0x55 'U'
  0x33,0x33,0x33,0x33,0x33,0x33,0x3F,0x00,
  // 0x56 'V'
  0x33,0x33,0x33,0x33,0x33,0x1E,0x0C,0x00,
  // 0x57 'W'
  0x63,0x63,0x63,0x6B,0x7F,0x77,0x63,0x00,
  // 0x58 'X'
  0x63,0x63,0x36,0x1C,0x1C,0x36,0x63,0x00,
  // 0x59 'Y'
  0x33,0x33,0x33,0x1E,0x0C,0x0C,0x1E,0x00,
  // 0x5A 'Z'
  0x7F,0x63,0x31,0x18,0x4C,0x66,0x7F,0x00,
  // 0x5B '['
  0x1E,0x06,0x06,0x06,0x06,0x06,0x1E,0x00,
  // 0x5C '\'
  0x03,0x06,0x0C,0x18,0x30,0x60,0x40,0x00,
  // 0x5D ']'
  0x1E,0x18,0x18,0x18,0x18,0x18,0x1E,0x00,
  // 0x5E '^'
  0x08,0x1C,0x36,0x63,0x00,0x00,0x00,0x00,
  // 0x5F '_'
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFF,
  // 0x60 '`'
  0x0C,0x0C,0x18,0x00,0x00,0x00,0x00,0x00,
  // 0x61 'a'
  0x00,0x00,0x1E,0x30,0x3E,0x33,0x6E,0x00,
  // 0x62 'b'
  0x07,0x06,0x06,0x3E,0x66,0x66,0x3B,0x00,
  // 0x63 'c'
  0x00,0x00,0x1E,0x33,0x03,0x33,0x1E,0x00,
  // 0x64 'd'
  0x38,0x30,0x30,0x3E,0x33,0x33,0x6E,0x00,
  // 0x65 'e'
  0x00,0x00,0x1E,0x33,0x3F,0x03,0x1E,0x00,
  // 0x66 'f'
  0x1C,0x36,0x06,0x0F,0x06,0x06,0x0F,0x00,
  // 0x67 'g'
  0x00,0x00,0x6E,0x33,0x33,0x3E,0x30,0x1F,
  // 0x68 'h'
  0x07,0x06,0x36,0x6E,0x66,0x66,0x67,0x00,
  // 0x69 'i'
  0x0C,0x00,0x0E,0x0C,0x0C,0x0C,0x1E,0x00,
  // 0x6A 'j'
  0x30,0x00,0x30,0x30,0x30,0x33,0x33,0x1E,
  // 0x6B 'k'
  0x07,0x06,0x66,0x36,0x1E,0x36,0x67,0x00,
  // 0x6C 'l'
  0x0E,0x0C,0x0C,0x0C,0x0C,0x0C,0x1E,0x00,
  // 0x6D 'm'
  0x00,0x00,0x33,0x7F,0x7F,0x6B,0x63,0x00,
  // 0x6E 'n'
  0x00,0x00,0x1F,0x33,0x33,0x33,0x33,0x00,
  // 0x6F 'o'
  0x00,0x00,0x1E,0x33,0x33,0x33,0x1E,0x00,
  // 0x70 'p'
  0x00,0x00,0x3B,0x66,0x66,0x3E,0x06,0x0F,
  // 0x71 'q'
  0x00,0x00,0x6E,0x33,0x33,0x3E,0x30,0x78,
  // 0x72 'r'
  0x00,0x00,0x3B,0x6E,0x66,0x06,0x0F,0x00,
  // 0x73 's'
  0x00,0x00,0x3E,0x03,0x1E,0x30,0x1F,0x00,
  // 0x74 't'
  0x08,0x0C,0x3E,0x0C,0x0C,0x2C,0x18,0x00,
  // 0x75 'u'
  0x00,0x00,0x33,0x33,0x33,0x33,0x6E,0x00,
  // 0x76 'v'
  0x00,0x00,0x33,0x33,0x33,0x1E,0x0C,0x00,
  // 0x77 'w'
  0x00,0x00,0x63,0x6B,0x7F,0x7F,0x36,0x00,
  // 0x78 'x'
  0x00,0x00,0x63,0x36,0x1C,0x36,0x63,0x00,
  // 0x79 'y'
  0x00,0x00,0x33,0x33,0x33,0x3E,0x30,0x1F,
  // 0x7A 'z'
  0x00,0x00,0x3F,0x19,0x0C,0x26,0x3F,0x00,
  // 0x7B '{'
  0x38,0x0C,0x0C,0x07,0x0C,0x0C,0x38,0x00,
  // 0x7C '|'
  0x18,0x18,0x18,0x00,0x18,0x18,0x18,0x00,
  // 0x7D '}'
  0x07,0x0C,0x0C,0x38,0x0C,0x0C,0x07,0x00,
  // 0x7E '~'
  0x6E,0x3B,0x00,0x00,0x00,0x00,0x00,0x00,
]);

// ---------------------------------------------------------------------------
// Atlas layout
//  16 columns × 6 rows = 96 cells  (95 glyphs 0x20–0x7E + 1 spare)
//  Texture size: 128 × 64 px  (ATLAS_TEX_H=64, padded above the 48px used)
// ---------------------------------------------------------------------------
const GLYPH_W    = 8;
const GLYPH_H    = 8;
const ATLAS_COLS = 16;
// ATLAS_ROWS not needed as a runtime constant — row computed per-glyph
const ATLAS_W    = ATLAS_COLS * GLYPH_W;  // 128
const ATLAS_TEX_H = 64;                   // texture height (>= 48, power-of-2 friendly)
const FIRST_CHAR  = 0x20;
const NUM_GLYPHS  = 0x7F - FIRST_CHAR;    // 95

// Vertex layout per vertex: xy(f32×2) + uv(f32×2) + rgba(f32×4) = 8 floats = 32 bytes
const STRIDE_F32    = 8;
const STRIDE_BYTES  = STRIDE_F32 * 4;
const VERTS_PER_CHAR   = 4;
const INDICES_PER_CHAR = 6;
const TAB_WIDTH = 4; // in glyphs

// ---------------------------------------------------------------------------
// WGSL shaders
//   group(0) binding(0) — uniform: screen_size: vec2f
//   group(1) binding(0) — texture_2d<f32>
//   group(1) binding(1) — sampler
// ---------------------------------------------------------------------------
const VERTEX_SRC = /* wgsl */`
// screen_size: canvas pixel dimensions
// y_sign:      +1.0 for top-left origin (Y increases downward),
//              -1.0 for bottom-left origin (Y increases upward)
struct Uniforms { screen_size: vec2f, y_sign: f32, _pad: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VIn  { @location(0) pos: vec2f, @location(1) uv: vec2f, @location(2) color: vec4f }
struct VOut { @builtin(position) clip: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f }

@vertex fn vs_main(vin: VIn) -> VOut {
  let ndcX =  vin.pos.x / u.screen_size.x * 2.0 - 1.0;
  // top-left:     y_sign = +1  =>  ndcY = 1 - 2*(y/h)   (0 at top, h at bottom)
  // bottom-left:  y_sign = -1  =>  ndcY = 2*(y/h) - 1   (0 at bottom, h at top)
  let ndcY = u.y_sign * (1.0 - vin.pos.y / u.screen_size.y * 2.0);
  return VOut(vec4f(ndcX, ndcY, 0.0, 1.0), vin.uv, vin.color);
}
`;

const FRAGMENT_SRC = /* wgsl */`
@group(1) @binding(0) var font_tex: texture_2d<f32>;
@group(1) @binding(1) var font_smp: sampler;

struct VOut { @builtin(position) clip: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f }

@fragment fn fs_main(vin: VOut) -> @location(0) vec4f {
  let alpha = textureSample(font_tex, font_smp, vin.uv).r;
  return vec4f(vin.color.rgb, vin.color.a * alpha);
}
`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createDebugText(gfx: Gfx, desc?: DebugTextDesc): DebugText {
  // Uint16 index buffer can address vertices 0–65535.  Each character uses
  // 4 vertices, so the maximum safe character count is floor(65535/4) = 16383.
  const MAX_CHARS_UINT16 = 16383;
  const requestedMaxChars = desc?.maxChars ?? 8192;
  if (requestedMaxChars > MAX_CHARS_UINT16) {
    console.warn(
      `debugText: maxChars ${requestedMaxChars} exceeds Uint16 index limit; ` +
      `clamped to ${MAX_CHARS_UINT16}`,
    );
  }
  const maxChars = Math.min(requestedMaxChars, MAX_CHARS_UINT16);
  const origin   = desc?.origin   ?? "top-left";
  const device   = gfx.device;

  // ---- Font atlas --------------------------------------------------------
  const atlasPixels = new Uint8Array(ATLAS_W * ATLAS_TEX_H * 4); // zero = transparent
  for (let gi = 0; gi < NUM_GLYPHS; gi++) {
    const col  = gi % ATLAS_COLS;
    const row  = Math.floor(gi / ATLAS_COLS);
    const baseX = col * GLYPH_W;
    const baseY = row * GLYPH_H;
    for (let py = 0; py < GLYPH_H; py++) {
      const rowByte = FONT_DATA[gi * GLYPH_H + py];
      for (let px = 0; px < GLYPH_W; px++) {
        if ((rowByte >> (7 - px)) & 1) {
          const idx = ((baseY + py) * ATLAS_W + (baseX + px)) * 4;
          atlasPixels[idx]     = 255;
          atlasPixels[idx + 1] = 255;
          atlasPixels[idx + 2] = 255;
          atlasPixels[idx + 3] = 255;
        }
      }
    }
  }

  const atlasTexture = device.createTexture({
    label: "debugtext_atlas",
    size: { width: ATLAS_W, height: ATLAS_TEX_H },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: atlasTexture },
    atlasPixels,
    { bytesPerRow: ATLAS_W * 4 },
    { width: ATLAS_W, height: ATLAS_TEX_H },
  );
  const atlasView = atlasTexture.createView();

  const atlasSampler = device.createSampler({
    label: "debugtext_sampler",
    minFilter:    "nearest",
    magFilter:    "nearest",
    mipmapFilter: "nearest",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  // ---- Vertex buffer (stream — rewritten each frame) ----------------------
  const vertexData = new Float32Array(maxChars * VERTS_PER_CHAR * STRIDE_F32);
  const vertexBuf  = device.createBuffer({
    label: "debugtext_vb",
    size:  vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // ---- Static index buffer -----------------------------------------------
  const indexData = new Uint16Array(maxChars * INDICES_PER_CHAR);
  for (let i = 0; i < maxChars; i++) {
    const v = i * 4;
    const k = i * 6;
    indexData[k]     = v;
    indexData[k + 1] = v + 1;
    indexData[k + 2] = v + 2;
    indexData[k + 3] = v;
    indexData[k + 4] = v + 2;
    indexData[k + 5] = v + 3;
  }
  const indexBuf = device.createBuffer({
    label: "debugtext_ib",
    size:  indexData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Uint16Array(indexBuf.getMappedRange()).set(indexData);
  indexBuf.unmap();

  // ---- Uniform buffer (screen_size — 8 bytes, padded to 256) --------------
  const uniformBuf = device.createBuffer({
    label: "debugtext_uniforms",
    size:  256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ---- Bind group layouts ------------------------------------------------
  const bgl0 = device.createBindGroupLayout({
    label: "debugtext_bgl0",
    entries: [{
      binding:    0,
      visibility: GPUShaderStage.VERTEX,
      buffer:     { type: "uniform" },
    }],
  });

  const bgl1 = device.createBindGroupLayout({
    label: "debugtext_bgl1",
    entries: [
      {
        binding:    0,
        visibility: GPUShaderStage.FRAGMENT,
        texture:    { sampleType: "float", viewDimension: "2d" },
      },
      {
        binding:    1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler:    { type: "filtering" },
      },
    ],
  });

  const bg0 = device.createBindGroup({
    label:  "debugtext_bg0",
    layout: bgl0,
    entries: [{ binding: 0, resource: { buffer: uniformBuf, size: 16 } }],
  });

  const bg1 = device.createBindGroup({
    label:  "debugtext_bg1",
    layout: bgl1,
    entries: [
      { binding: 0, resource: atlasView },
      { binding: 1, resource: atlasSampler },
    ],
  });

  // ---- Pipeline ----------------------------------------------------------
  // We need group 0 + group 1, so we build the GPURenderPipeline directly.
  // The swapchain format must match whatever the canvas context uses.
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  const pipelineLayout = device.createPipelineLayout({
    label: "debugtext_layout",
    bindGroupLayouts: [bgl0, bgl1],
  });

  const pipeline = device.createRenderPipeline({
    label: "debugtext_pipeline",
    layout: pipelineLayout,
    vertex: {
      module:     device.createShaderModule({ code: VERTEX_SRC,   label: "debugtext_vs" }),
      entryPoint: "vs_main",
      buffers: [{
        arrayStride: STRIDE_BYTES,
        stepMode:    "vertex",
        attributes: [
          { shaderLocation: 0, offset:  0, format: "float32x2" }, // pos
          { shaderLocation: 1, offset:  8, format: "float32x2" }, // uv
          { shaderLocation: 2, offset: 16, format: "float32x4" }, // color
        ],
      }],
    },
    fragment: {
      module:     device.createShaderModule({ code: FRAGMENT_SRC, label: "debugtext_fs" }),
      entryPoint: "fs_main",
      targets: [{
        format: canvasFormat,
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
        },
      }],
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });

  // ---- Per-frame mutable state -------------------------------------------
  let charCount    = 0;
  let defaultColor: [number, number, number, number] = [1, 1, 1, 1];
  let scale        = 1;

  // ---- Internal helper ---------------------------------------------------
  function pushQuad(
    sx: number, sy: number,
    glyphIdx: number,
    color: [number, number, number, number],
    s: number,
  ): void {
    if (charCount >= maxChars) return; // graceful clamp

    const col  = glyphIdx % ATLAS_COLS;
    const row  = Math.floor(glyphIdx / ATLAS_COLS);
    const u0 = (col * GLYPH_W)       / ATLAS_W;
    const v0 = (row * GLYPH_H)       / ATLAS_TEX_H;
    const u1 = u0 + GLYPH_W / ATLAS_W;
    const v1 = v0 + GLYPH_H / ATLAS_TEX_H;
    const w  = GLYPH_W * s;
    const h  = GLYPH_H * s;
    const [r, g, b, a] = color;

    const base = charCount * VERTS_PER_CHAR * STRIDE_F32;
    // Top-left
    vertexData[base +  0] = sx;     vertexData[base +  1] = sy;
    vertexData[base +  2] = u0;     vertexData[base +  3] = v0;
    vertexData[base +  4] = r;      vertexData[base +  5] = g;
    vertexData[base +  6] = b;      vertexData[base +  7] = a;
    // Top-right
    vertexData[base +  8] = sx + w; vertexData[base +  9] = sy;
    vertexData[base + 10] = u1;     vertexData[base + 11] = v0;
    vertexData[base + 12] = r;      vertexData[base + 13] = g;
    vertexData[base + 14] = b;      vertexData[base + 15] = a;
    // Bottom-right
    vertexData[base + 16] = sx + w; vertexData[base + 17] = sy + h;
    vertexData[base + 18] = u1;     vertexData[base + 19] = v1;
    vertexData[base + 20] = r;      vertexData[base + 21] = g;
    vertexData[base + 22] = b;      vertexData[base + 23] = a;
    // Bottom-left
    vertexData[base + 24] = sx;     vertexData[base + 25] = sy + h;
    vertexData[base + 26] = u0;     vertexData[base + 27] = v1;
    vertexData[base + 28] = r;      vertexData[base + 29] = g;
    vertexData[base + 30] = b;      vertexData[base + 31] = a;

    charCount++;
  }

  // ---- Public object -----------------------------------------------------
  const dt: DebugText = {

    setColor(r, g, b, a = 1) {
      defaultColor = [r, g, b, a];
    },

    setScale(s) {
      scale = s;
    },

    print(x, y, text, color?) {
      const col       = color ?? defaultColor;
      const s         = scale;
      const glyphW    = GLYPH_W * s;
      const glyphH    = GLYPH_H * s;
      const tabW      = TAB_WIDTH * glyphW;

      let cx = x;
      let cy = y;

      for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        if (ch === 0x0A) {       // \n
          cx = x;
          cy += glyphH;
          continue;
        }
        if (ch === 0x09) {       // \t
          const offset = cx - x;
          cx = x + Math.floor(offset / tabW + 1) * tabW;
          continue;
        }
        if (ch < FIRST_CHAR || ch > 0x7E) continue;
        pushQuad(cx, cy, ch - FIRST_CHAR, col, s);
        cx += glyphW;
      }
    },

    printf(x, y, fmt, ...args) {
      let argIdx = 0;
      const str = fmt.replace(/%(\.\d+)?([sdifeEgG%])/g, (_m, prec, spec) => {
        if (spec === "%") return "%";
        const val = args[argIdx++];
        if (spec === "f") {
          const decimals = prec ? parseInt(prec.slice(1)) : 6;
          return (val as number).toFixed(decimals);
        }
        if (spec === "e" || spec === "E") {
          const decimals = prec ? parseInt(prec.slice(1)) : 6;
          const s = (val as number).toExponential(decimals);
          return spec === "E" ? s.toUpperCase() : s;
        }
        if (spec === "g" || spec === "G") {
          const precision = prec ? parseInt(prec.slice(1)) : 6;
          const s = (val as number).toPrecision(precision || 1);
          return spec === "G" ? s.toUpperCase() : s;
        }
        if (spec === "d" || spec === "i") return String(Math.trunc(val as number));
        return String(val);
      });
      this.print(x, y, str);
    },

    draw(gfxCtx: Gfx) {
      if (charCount === 0) return;

      // Upload vertex data for this frame
      device.queue.writeBuffer(
        vertexBuf, 0,
        vertexData.buffer,
        vertexData.byteOffset,
        charCount * VERTS_PER_CHAR * STRIDE_BYTES,
      );

      // Upload screen-size uniform (re-reads canvas dimensions each frame).
      const screenW = gfxCtx.width;
      const screenH = gfxCtx.height;
      const ySign   = origin === "bottom-left" ? -1.0 : 1.0;
      device.queue.writeBuffer(uniformBuf, 0, new Float32Array([screenW, screenH, ySign, 0]));

      // We need the current swapchain texture view to build our render pass.
      // gfx.beginPass()/endPass() own the swapchain texture for the frame, so we
      // cooperate with gfx by calling endPass() to close any open pass, then
      // record our own encoder targeting the same texture.
      // Callers should call gfx.endPass() before dt.draw(), OR draw() handles it
      // gracefully by obtaining the view directly from the GPUCanvasContext.
      gfxCtx.endPass();  // no-op if no pass is open (gfx checks internally)

      const ctx = gfxCtx.canvas.getContext("webgpu") as GPUCanvasContext;
      const swapView = ctx.getCurrentTexture().createView();

      const enc  = device.createCommandEncoder({ label: "debugtext_cmd" });
      const pass = enc.beginRenderPass({
        colorAttachments: [{
          view:    swapView,
          loadOp:  "load",  // LoadAction.LOAD — overlay on existing content
          storeOp: "store",
        }],
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg0);
      pass.setBindGroup(1, bg1);
      pass.setVertexBuffer(0, vertexBuf);
      pass.setIndexBuffer(indexBuf, "uint16");
      pass.drawIndexed(charCount * INDICES_PER_CHAR);
      pass.end();

      device.queue.submit([enc.finish()]);

      // Reset per-frame state
      charCount = 0;
    },

    destroy() {
      atlasTexture.destroy();
      vertexBuf.destroy();
      indexBuf.destroy();
      uniformBuf.destroy();
    },
  };

  return dt;
}
