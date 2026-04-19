import { run } from "../../src/index.js";
import {
  type Gfx,
  type SgBuffer,
  type SgPipeline,
  LoadAction,
  VertexFormat,
} from "../../src/index.js";
import shaderSource from "./instancing.wgsl?raw";

// ── Constants ────────────────────────────────────────────────────────────────

const NUM_INSTANCES = 64;

// ── Geometry (a small triangle, per-vertex data) ─────────────────────────────

// prettier-ignore
const SHAPE_VERTICES = new Float32Array([
   0.0,  0.04,  // top
  -0.035, -0.02, // bottom-left
   0.035, -0.02, // bottom-right
]);

// ── Per-instance data: [offsetX, offsetY, scale, r, g, b] ───────────────────

function buildInstanceData(): Float32Array {
  const data = new Float32Array(NUM_INSTANCES * 6);
  for (let i = 0; i < NUM_INSTANCES; i++) {
    const angle = (i / NUM_INSTANCES) * Math.PI * 2;
    const ring = Math.floor(i / 16);
    const radius = 0.25 + ring * 0.2;
    const base = i * 6;
    // Position on concentric rings
    data[base + 0] = Math.cos(angle) * radius;
    data[base + 1] = Math.sin(angle) * radius;
    // Scale
    data[base + 2] = 0.8 + Math.sin(angle * 3) * 0.4;
    // Colour: hue cycle
    const hue = i / NUM_INSTANCES;
    data[base + 3] = Math.max(0, Math.cos(hue * Math.PI * 2) * 0.5 + 0.5);
    data[base + 4] = Math.max(0, Math.cos((hue - 1 / 3) * Math.PI * 2) * 0.5 + 0.5);
    data[base + 5] = Math.max(0, Math.cos((hue - 2 / 3) * Math.PI * 2) * 0.5 + 0.5);
  }
  return data;
}

// ── App state ────────────────────────────────────────────────────────────────

let vertexBuffer: SgBuffer;
let instanceBuffer: SgBuffer;
let pipeline: SgPipeline;
let elapsed = 0;

// ── Init ─────────────────────────────────────────────────────────────────────

async function init(gfx: Gfx): Promise<void> {
  vertexBuffer = gfx.makeBuffer({ data: SHAPE_VERTICES, label: "shape-vb" });
  instanceBuffer = gfx.makeBuffer({ data: buildInstanceData(), label: "instance-vb" });

  const shader = await gfx.makeShader({
    source: shaderSource,
    label: "instancing",
  });

  pipeline = gfx.makePipeline({
    shader,
    layout: {
      buffers: [
        { stride: 8, stepMode: "vertex" },    // buffer 0: per-vertex pos (vec2f)
        { stride: 24, stepMode: "instance" },  // buffer 1: per-instance data (6 floats)
      ],
      attrs: [
        // Buffer 0: vertex position
        { shaderLocation: 0, format: VertexFormat.FLOAT2, offset: 0, bufferIndex: 0 },
        // Buffer 1: offset_and_scale (vec3f)
        { shaderLocation: 1, format: VertexFormat.FLOAT3, offset: 0, bufferIndex: 1 },
        // Buffer 1: color (vec3f)
        { shaderLocation: 2, format: VertexFormat.FLOAT3, offset: 12, bufferIndex: 1 },
      ],
    },
    label: "instancing",
  });
}

// ── Frame ────────────────────────────────────────────────────────────────────

function frame(gfx: Gfx): void {
  elapsed += gfx.dt;

  gfx.beginPass({
    colorAttachments: [{ action: LoadAction.CLEAR, color: [0.05, 0.05, 0.1, 1] }],
  });

  gfx.applyPipeline(pipeline);
  gfx.applyBindings({ vertexBuffers: [vertexBuffer, instanceBuffer] });

  // Uniforms: [aspect, time, pad, pad] — padded to 16 bytes
  const aspect = gfx.width / gfx.height;
  gfx.applyUniforms(new Float32Array([aspect, elapsed, 0, 0]));

  gfx.draw(0, 3, NUM_INSTANCES);

  gfx.endPass();
  gfx.commit();
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

run({ canvas: "#canvas", init, frame });
