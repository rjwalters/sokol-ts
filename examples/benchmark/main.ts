import { run } from "../../src/index.js";
import { type Gfx, type SgBuffer, type SgPipeline, LoadAction, VertexFormat } from "../../src/index.js";
import shaderSource from "./benchmark.wgsl?raw";

// ── Query-string parameters ─────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const TOTAL_DRAWS = Math.max(1, parseInt(params.get("draws") ?? "1000", 10));
const NUM_PIPELINES = Math.max(1, parseInt(params.get("pipelines") ?? "1", 10));
const NUM_BINDINGS = Math.max(1, parseInt(params.get("bindings") ?? "1", 10));

// ── Constants ───────────────────────────────────────────────────────────────

// 64KB uniform buffer with 256-byte alignment = 256 applyUniforms per pass
const MAX_DRAWS_PER_PASS = 256;

// ── Geometry (small triangle) ───────────────────────────────────────────────

// prettier-ignore
const TRIANGLE_VERTICES = new Float32Array([
   0.0,  0.02,  // top
  -0.017, -0.01, // bottom-left
   0.017, -0.01, // bottom-right
]);

// ── HUD overlay ─────────────────────────────────────────────────────────────

let hudDiv: HTMLDivElement;

function createHud(): void {
  hudDiv = document.createElement("div");
  hudDiv.style.cssText =
    "position:fixed;top:8px;left:8px;color:#0f0;font:14px monospace;" +
    "background:rgba(0,0,0,0.7);padding:8px 12px;border-radius:4px;" +
    "pointer-events:none;z-index:1000;white-space:pre";
  document.body.appendChild(hudDiv);
}

function updateHud(stats: BenchStats): void {
  hudDiv.textContent =
    `draws: ${TOTAL_DRAWS}  pipelines: ${NUM_PIPELINES}  bindings: ${NUM_BINDINGS}\n` +
    `fps: ${stats.fps.toFixed(1)}  median: ${stats.medianMs.toFixed(2)}ms  p95: ${stats.p95Ms.toFixed(2)}ms\n` +
    `passes/frame: ${Math.ceil(TOTAL_DRAWS / MAX_DRAWS_PER_PASS)}`;
}

// ── Frame timing ────────────────────────────────────────────────────────────

interface BenchStats {
  medianMs: number;
  p95Ms: number;
  fps: number;
  drawCalls: number;
}

const WINDOW_SIZE = 120;
const frameTimes: number[] = [];

function recordFrameTime(ms: number): void {
  frameTimes.push(ms);
  if (frameTimes.length > WINDOW_SIZE) {
    frameTimes.shift();
  }
}

function computeStats(): BenchStats {
  if (frameTimes.length === 0) {
    return { medianMs: 0, p95Ms: 0, fps: 0, drawCalls: TOTAL_DRAWS };
  }
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const len = sorted.length;
  const medianMs = sorted[Math.floor(len / 2)];
  const p95Ms = sorted[Math.floor(len * 0.95)];
  const avgMs = frameTimes.reduce((a, b) => a + b, 0) / len;
  return {
    medianMs,
    p95Ms,
    fps: avgMs > 0 ? 1000 / avgMs : 0,
    drawCalls: TOTAL_DRAWS,
  };
}

// ── Pre-compute draw-call layout ────────────────────────────────────────────

interface DrawCall {
  offsetX: number;
  offsetY: number;
  scale: number;
  r: number;
  g: number;
  b: number;
  pipelineIndex: number;
  bindingIndex: number;
}

function buildDrawCalls(): DrawCall[] {
  const calls: DrawCall[] = [];
  const cols = Math.ceil(Math.sqrt(TOTAL_DRAWS));
  const rows = Math.ceil(TOTAL_DRAWS / cols);
  const cellW = 2.0 / cols;
  const cellH = 2.0 / rows;
  const scale = Math.min(cellW, cellH) * 0.4;

  for (let i = 0; i < TOTAL_DRAWS; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const hue = i / TOTAL_DRAWS;
    calls.push({
      offsetX: -1 + cellW * (col + 0.5),
      offsetY: -1 + cellH * (row + 0.5),
      scale,
      r: Math.max(0, Math.cos(hue * Math.PI * 2) * 0.5 + 0.5),
      g: Math.max(0, Math.cos((hue - 1 / 3) * Math.PI * 2) * 0.5 + 0.5),
      b: Math.max(0, Math.cos((hue - 2 / 3) * Math.PI * 2) * 0.5 + 0.5),
      pipelineIndex: i % NUM_PIPELINES,
      bindingIndex: i % NUM_BINDINGS,
    });
  }
  return calls;
}

// ── App state ───────────────────────────────────────────────────────────────

let pipelines: SgPipeline[] = [];
let vertexBuffers: SgBuffer[] = [];
let drawCalls: DrawCall[] = [];
const uniformData = new Float32Array(8); // 2 vec4f = 32 bytes

// ── Init ────────────────────────────────────────────────────────────────────

async function init(gfx: Gfx): Promise<void> {
  createHud();

  // Create vertex buffers (one per binding variant, all identical geometry)
  for (let i = 0; i < NUM_BINDINGS; i++) {
    vertexBuffers.push(
      gfx.makeBuffer({ data: TRIANGLE_VERTICES, label: `bench-vb-${i}` }),
    );
  }

  // Create shader
  const shader = await gfx.makeShader({
    source: shaderSource,
    label: "benchmark",
  });

  // Create pipelines (all identical config but distinct objects)
  for (let i = 0; i < NUM_PIPELINES; i++) {
    pipelines.push(
      gfx.makePipeline({
        shader,
        layout: {
          buffers: [{ stride: 8 }], // 2 floats x 4 bytes
          attrs: [
            { shaderLocation: 0, format: VertexFormat.FLOAT2, offset: 0 },
          ],
        },
        label: `bench-pip-${i}`,
      }),
    );
  }

  drawCalls = buildDrawCalls();

  // Expose bench stats on window for e2e tests
  (window as unknown as Record<string, unknown>).__bench = computeStats();
}

// ── Frame ───────────────────────────────────────────────────────────────────

function frame(gfx: Gfx): void {
  const frameStart = performance.now();

  const numPasses = Math.ceil(TOTAL_DRAWS / MAX_DRAWS_PER_PASS);

  for (let pass = 0; pass < numPasses; pass++) {
    const startDraw = pass * MAX_DRAWS_PER_PASS;
    const endDraw = Math.min(startDraw + MAX_DRAWS_PER_PASS, TOTAL_DRAWS);
    const isFirstPass = pass === 0;

    gfx.beginPass({
      colorAttachments: [
        {
          action: isFirstPass ? LoadAction.CLEAR : LoadAction.LOAD,
          color: [0.05, 0.05, 0.1, 1],
        },
      ],
    });

    for (let i = startDraw; i < endDraw; i++) {
      const dc = drawCalls[i];

      gfx.applyPipeline(pipelines[dc.pipelineIndex]);
      gfx.applyBindings({ vertexBuffers: [vertexBuffers[dc.bindingIndex]] });

      // Pack uniforms: vec4(offsetX, offsetY, scale, 0) + vec4(r, g, b, 1)
      uniformData[0] = dc.offsetX;
      uniformData[1] = dc.offsetY;
      uniformData[2] = dc.scale;
      uniformData[3] = 0;
      uniformData[4] = dc.r;
      uniformData[5] = dc.g;
      uniformData[6] = dc.b;
      uniformData[7] = 1;
      gfx.applyUniforms(uniformData);

      gfx.draw(0, 3);
    }

    gfx.endPass();
  }

  gfx.commit();

  const frameMs = performance.now() - frameStart;
  recordFrameTime(frameMs);

  const stats = computeStats();
  (window as unknown as Record<string, unknown>).__bench = stats;
  updateHud(stats);
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

run({ canvas: "#canvas", init, frame });
