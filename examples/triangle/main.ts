import { run } from "../../src/index.js";
import { type Gfx, type SgBuffer, type SgPipeline, LoadAction, VertexFormat } from "../../src/index.js";
import shaderSource from "./triangle.wgsl?raw";

// ── Geometry ─────────────────────────────────────────────────────────────────

// Three vertices: [x, y, r, g, b]
// prettier-ignore
const TRIANGLE_VERTICES = new Float32Array([
   0.0,  0.5,   1.0, 0.2, 0.2,  // top    — red
  -0.5, -0.5,   0.2, 1.0, 0.2,  // left   — green
   0.5, -0.5,   0.2, 0.2, 1.0,  // right  — blue
]);

// ── App state ────────────────────────────────────────────────────────────────

let vertexBuffer: SgBuffer;
let pipeline: SgPipeline;

// ── Init ─────────────────────────────────────────────────────────────────────

async function init(gfx: Gfx): Promise<void> {
  vertexBuffer = gfx.makeBuffer({ data: TRIANGLE_VERTICES, label: "triangle-vb" });

  const shader = await gfx.makeShader({
    source: shaderSource,
    label: "triangle",
  });

  pipeline = gfx.makePipeline({
    shader,
    layout: {
      buffers: [{ stride: 20 }], // 5 floats × 4 bytes
      attrs: [
        { shaderLocation: 0, format: VertexFormat.FLOAT2, offset: 0 },
        { shaderLocation: 1, format: VertexFormat.FLOAT3, offset: 8 },
      ],
    },
    label: "triangle",
  });
}

// ── Frame ────────────────────────────────────────────────────────────────────

function frame(gfx: Gfx): void {
  gfx.beginPass({
    colorAttachments: [{ action: LoadAction.CLEAR, color: [0.05, 0.05, 0.1, 1] }],
  });

  gfx.applyPipeline(pipeline);
  gfx.applyBindings({ vertexBuffers: [vertexBuffer] });
  // No uniforms needed — pass a dummy Float32Array so the uniform bind group is valid
  gfx.applyUniforms(new Float32Array(4));
  gfx.draw(0, 3);

  gfx.endPass();
  gfx.commit();
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

run({ canvas: "#canvas", init, frame });
