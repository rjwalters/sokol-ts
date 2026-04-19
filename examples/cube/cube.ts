import { run } from "../../src/index.js";
import {
  type Gfx,
  type SgBuffer,
  type SgPipeline,
  type SgImage,
  IndexType,
  LoadAction,
  PixelFormat,
  VertexFormat,
  CullMode,
  CompareFunc,
} from "../../src/index.js";
import { CUBE_VERTICES, CUBE_INDICES } from "./cube-data.js";
import { mat4Multiply, mat4Perspective, mat4RotateX, mat4RotateY, mat4Translation } from "./mat4.js";

// ── Shaders ──────────────────────────────────────────────────────────────────

const VERTEX_SHADER = /* wgsl */ `
struct Uniforms { mvp: mat4x4f }
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertIn  { @location(0) pos: vec3f, @location(1) col: vec3f }
struct VertOut { @builtin(position) pos: vec4f, @location(0) col: vec3f }

@vertex fn vs_main(v: VertIn) -> VertOut {
  return VertOut(u.mvp * vec4f(v.pos, 1.0), v.col);
}
`;

const FRAGMENT_SHADER = /* wgsl */ `
@fragment fn fs_main(@location(0) col: vec3f) -> @location(0) vec4f {
  return vec4f(col, 1.0);
}
`;

// ── App state ─────────────────────────────────────────────────────────────────

let vertexBuffer: SgBuffer;
let indexBuffer: SgBuffer;
let pipeline: SgPipeline;
let depthImage: SgImage;
let depthW = 0;
let depthH = 0;

let rotX = 0.3;
let rotY = 0.0;

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(gfx: Gfx): Promise<void> {
  vertexBuffer = gfx.makeBuffer({ data: CUBE_VERTICES, label: "cube-vb" });
  indexBuffer = gfx.makeBuffer({ data: CUBE_INDICES, label: "cube-ib" });

  const shader = await gfx.makeShader({
    vertexSource: VERTEX_SHADER,
    fragmentSource: FRAGMENT_SHADER,
    label: "cube",
  });

  pipeline = gfx.makePipeline({
    shader,
    layout: {
      buffers: [{ stride: 24 }],
      attrs: [
        { shaderLocation: 0, format: VertexFormat.FLOAT3, offset: 0 },
        { shaderLocation: 1, format: VertexFormat.FLOAT3, offset: 12 },
      ],
    },
    indexType: IndexType.UINT16,
    cullMode: CullMode.BACK,
    depth: {
      format: PixelFormat.DEPTH24_STENCIL8,
      depthWrite: true,
      depthCompare: CompareFunc.LESS,
    },
    label: "cube",
  });

  depthImage = gfx.makeImage({
    width: gfx.width,
    height: gfx.height,
    format: PixelFormat.DEPTH24_STENCIL8,
    renderTarget: true,
    label: "depth",
  });
  depthW = gfx.width;
  depthH = gfx.height;
}

// ── Frame ─────────────────────────────────────────────────────────────────────

function frame(gfx: Gfx): void {
  // Accumulate rotation
  rotY += gfx.dt * 1.0;
  rotX += gfx.dt * 0.4;

  // Recreate depth texture on resize
  if (gfx.width !== depthW || gfx.height !== depthH) {
    gfx.destroyImage(depthImage);
    depthImage = gfx.makeImage({
      width: gfx.width,
      height: gfx.height,
      format: PixelFormat.DEPTH24_STENCIL8,
      renderTarget: true,
      label: "depth",
    });
    depthW = gfx.width;
    depthH = gfx.height;
  }

  // Build MVP
  const model = mat4Multiply(mat4RotateY(rotY), mat4RotateX(rotX));
  const view = mat4Translation(0, 0, -4);
  const proj = mat4Perspective(Math.PI / 4, gfx.width / gfx.height, 0.1, 100);
  const mvp = mat4Multiply(proj, mat4Multiply(view, model));

  gfx.beginPass({
    colorAttachments: [{ action: LoadAction.CLEAR, color: [0.1, 0.1, 0.15, 1] }],
    depthAttachment: { action: LoadAction.CLEAR, value: 1.0 },
    swapchainDepthImage: depthImage,
  });

  gfx.applyPipeline(pipeline);
  gfx.applyBindings({ vertexBuffers: [vertexBuffer], indexBuffer });
  gfx.applyUniforms(mvp);
  gfx.draw(0, 36);

  gfx.endPass();
  gfx.commit();
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

run({ canvas: "#canvas", init, frame });
