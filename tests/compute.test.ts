/**
 * Tests for compute shader and compute pipeline support in gfx.ts.
 * Tests exercise the public createGfx() API using mock GPU objects.
 */

import { describe, it, expect } from "vitest";
import { createGfx } from "../src/gfx.js";
import { BufferUsage } from "../src/types.js";
import { createMockGfxDeps } from "./gpu-mock.js";

function makeGfx() {
  const deps = createMockGfxDeps();
  return createGfx(deps.device, deps.canvas, deps.context, deps.format);
}

// ---------------------------------------------------------------------------
// Compute shader creation
// ---------------------------------------------------------------------------

describe("Compute: shader creation", () => {
  it("creates a valid compute shader handle", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
      label: "test_compute",
    });
    expect(shd.id).toBeGreaterThan(0);
    expect(shd._brand).toBe("SgShader");
    expect(gfx.isValidComputeShader(shd)).toBe(true);
  });

  it("uses default entry point cs_main", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    expect(gfx.isValidComputeShader(shd)).toBe(true);
  });

  it("accepts a custom entry point", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn my_compute() {}",
      entryPoint: "my_compute",
    });
    expect(gfx.isValidComputeShader(shd)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compute pipeline creation
// ---------------------------------------------------------------------------

describe("Compute: pipeline creation", () => {
  it("creates a valid compute pipeline handle", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const pip = gfx.makeComputePipeline({
      shader: shd,
      storageBuffers: 1,
    });
    expect(pip.id).toBeGreaterThan(0);
    expect(pip._brand).toBe("SgPipeline");
    expect(gfx.isValidComputePipeline(pip)).toBe(true);
  });

  it("creates a compute pipeline with uniforms", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const pip = gfx.makeComputePipeline({
      shader: shd,
      storageBuffers: 1,
      uniforms: true,
    });
    expect(gfx.isValidComputePipeline(pip)).toBe(true);
  });

  it("creates a compute pipeline with read-only storage bindings", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const pip = gfx.makeComputePipeline({
      shader: shd,
      storageBuffers: [{ readOnly: true }, { readOnly: false }],
    });
    expect(gfx.isValidComputePipeline(pip)).toBe(true);
  });

  it("throws on invalid compute shader handle", () => {
    const gfx = makeGfx();
    const fakeShd = { _brand: "SgShader" as const, id: 999999 };
    expect(() => gfx.makeComputePipeline({ shader: fakeShd })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Compute pipeline destroy and isValid
// ---------------------------------------------------------------------------

describe("Compute: pipeline destroy and isValid", () => {
  it("marks compute pipeline as invalid after destroy", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const pip = gfx.makeComputePipeline({ shader: shd, storageBuffers: 1 });
    expect(gfx.isValidComputePipeline(pip)).toBe(true);
    gfx.destroyComputePipeline(pip);
    expect(gfx.isValidComputePipeline(pip)).toBe(false);
  });

  it("marks compute shader as invalid after destroy", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    expect(gfx.isValidComputeShader(shd)).toBe(true);
    gfx.destroyComputeShader(shd);
    expect(gfx.isValidComputeShader(shd)).toBe(false);
  });

  it("destroyComputeShader does not affect render shader with same-index handle", async () => {
    const gfx = makeGfx();
    // Both pools start at slot 1, so first alloc from each produces the same encoded ID.
    const renderShd = await gfx.makeShader({
      source: "@vertex fn vs_main() -> @builtin(position) vec4f { return vec4f(0); }\n@fragment fn fs_main() -> @location(0) vec4f { return vec4f(1); }",
    });
    const computeShd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    // Both should be valid in their respective pools
    expect(gfx.isValid(renderShd)).toBe(true);
    expect(gfx.isValidComputeShader(computeShd)).toBe(true);

    // Destroying compute shader must NOT affect render shader
    gfx.destroyComputeShader(computeShd);
    expect(gfx.isValid(renderShd)).toBe(true);
    expect(gfx.isValidComputeShader(computeShd)).toBe(false);
  });

  it("destroyComputePipeline does not affect render pipeline with same-index handle", async () => {
    const gfx = makeGfx();
    const renderShd = await gfx.makeShader({
      source: "@vertex fn vs_main() -> @builtin(position) vec4f { return vec4f(0); }\n@fragment fn fs_main() -> @location(0) vec4f { return vec4f(1); }",
    });
    const computeShd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const renderPip = gfx.makePipeline({
      shader: renderShd,
      layout: { buffers: [{ stride: 16 }], attrs: [{ format: "float32x4" as never, shaderLocation: 0 }] },
    });
    const computePip = gfx.makeComputePipeline({ shader: computeShd, storageBuffers: 1 });

    expect(gfx.isValid(renderPip)).toBe(true);
    expect(gfx.isValidComputePipeline(computePip)).toBe(true);

    // Destroying compute pipeline must NOT affect render pipeline
    gfx.destroyComputePipeline(computePip);
    expect(gfx.isValid(renderPip)).toBe(true);
    expect(gfx.isValidComputePipeline(computePip)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Storage buffer usage flag
// ---------------------------------------------------------------------------

describe("Compute: BufferUsage.STORAGE", () => {
  it("creates a storage buffer", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({
      size: 256,
      usage: BufferUsage.STORAGE,
      label: "storage_buf",
    });
    expect(gfx.isValid(buf)).toBe(true);
  });

  it("allows updating a storage buffer", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({
      size: 256,
      usage: BufferUsage.STORAGE,
    });
    expect(() =>
      gfx.updateBuffer(buf, new Float32Array([1, 2, 3, 4]))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Compute pass lifecycle
// ---------------------------------------------------------------------------

describe("Compute: pass lifecycle", () => {
  it("runs beginComputePass / endPass without error", async () => {
    const gfx = makeGfx();
    gfx.beginComputePass();
    gfx.endPass();
    gfx.commit();
  });

  it("dispatches workgroups in a compute pass", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const pip = gfx.makeComputePipeline({ shader: shd, storageBuffers: 1 });
    const buf = gfx.makeBuffer({ size: 256, usage: BufferUsage.STORAGE });

    gfx.beginComputePass();
    gfx.applyComputePipeline(pip);
    gfx.applyComputeBindings({ storageBuffers: [buf] });
    gfx.dispatchWorkgroups(4);
    gfx.endPass();
    gfx.commit();
  });

  it("throws on dispatchWorkgroups with no active compute pass", () => {
    const gfx = makeGfx();
    expect(() => gfx.dispatchWorkgroups(1)).toThrow("No active compute pass");
  });

  it("throws on dispatchWorkgroupsIndirect with no active compute pass", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 256, usage: BufferUsage.STORAGE });
    expect(() => gfx.dispatchWorkgroupsIndirect(buf)).toThrow("No active compute pass");
  });

  it("dispatchWorkgroupsIndirect works with a valid buffer", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const pip = gfx.makeComputePipeline({ shader: shd });
    const indirectBuf = gfx.makeBuffer({ size: 12, usage: BufferUsage.INDIRECT });

    gfx.beginComputePass();
    gfx.applyComputePipeline(pip);
    gfx.dispatchWorkgroupsIndirect(indirectBuf);
    gfx.endPass();
    gfx.commit();
  });
});

// ---------------------------------------------------------------------------
// Overlapping pass guards
// ---------------------------------------------------------------------------

describe("Compute: overlapping pass guards", () => {
  it("throws on beginPass while a compute pass is active", () => {
    const gfx = makeGfx();
    gfx.beginComputePass();
    expect(() => gfx.beginPass()).toThrow(
      "beginPass() called while a compute pass is active -- call endPass() first"
    );
  });

  it("throws on beginComputePass while a render pass is active", () => {
    const gfx = makeGfx();
    gfx.beginPass();
    expect(() => gfx.beginComputePass()).toThrow(
      "beginComputePass() called while a render pass is active -- call endPass() first"
    );
  });

  it("throws on beginPass while a render pass is already active", () => {
    const gfx = makeGfx();
    gfx.beginPass();
    expect(() => gfx.beginPass()).toThrow(
      "beginPass() called while a render pass is already active -- call endPass() first"
    );
  });

  it("throws on beginComputePass while a compute pass is already active", () => {
    const gfx = makeGfx();
    gfx.beginComputePass();
    expect(() => gfx.beginComputePass()).toThrow(
      "beginComputePass() called while a compute pass is already active -- call endPass() first"
    );
  });

  it("allows beginPass after endPass closes a compute pass", () => {
    const gfx = makeGfx();
    gfx.beginComputePass();
    gfx.endPass();
    expect(() => gfx.beginPass()).not.toThrow();
    gfx.endPass();
    gfx.commit();
  });

  it("allows beginComputePass after endPass closes a render pass", () => {
    const gfx = makeGfx();
    gfx.beginPass();
    gfx.endPass();
    expect(() => gfx.beginComputePass()).not.toThrow();
    gfx.endPass();
    gfx.commit();
  });
});

// ---------------------------------------------------------------------------
// Compute and render pass coexistence
// ---------------------------------------------------------------------------

describe("Compute: coexistence with render passes", () => {
  it("runs a compute pass followed by a render pass in the same frame", async () => {
    const gfx = makeGfx();
    const compShd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const compPip = gfx.makeComputePipeline({ shader: compShd, storageBuffers: 1 });
    const buf = gfx.makeBuffer({ size: 256, usage: BufferUsage.STORAGE });

    // Compute pass
    gfx.beginComputePass();
    gfx.applyComputePipeline(compPip);
    gfx.applyComputeBindings({ storageBuffers: [buf] });
    gfx.dispatchWorkgroups(4);
    gfx.endPass();

    // Render pass (using default swapchain)
    gfx.beginPass();
    gfx.endPass();

    gfx.commit();
  });
});

// ---------------------------------------------------------------------------
// DrawStats includes dispatchCalls
// ---------------------------------------------------------------------------

describe("Compute: DrawStats.dispatchCalls", () => {
  it("increments dispatchCalls for each dispatch", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const pip = gfx.makeComputePipeline({ shader: shd });

    gfx.beginComputePass();
    gfx.applyComputePipeline(pip);
    gfx.dispatchWorkgroups(1);
    gfx.dispatchWorkgroups(2, 2);
    gfx.dispatchWorkgroups(1, 1, 1);
    gfx.endPass();

    // frameStats accumulates across all passes within a frame;
    // stats are reset in commit(), not beginPass().
    const stats = gfx.frameStats;
    expect(stats.dispatchCalls).toBe(3);
  });

  it("starts dispatchCalls at zero after commit", () => {
    const gfx = makeGfx();
    // After commit() resets stats, dispatchCalls should be 0
    gfx.beginComputePass();
    gfx.endPass();
    gfx.commit();
    expect(gfx.frameStats.dispatchCalls).toBe(0);
  });

  it("accumulates dispatch and draw stats across compute and render passes", async () => {
    const gfx = makeGfx();
    const compShd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const compPip = gfx.makeComputePipeline({ shader: compShd, storageBuffers: 1 });
    const buf = gfx.makeBuffer({ size: 256, usage: BufferUsage.STORAGE });

    // Compute pass: 2 dispatches
    gfx.beginComputePass();
    gfx.applyComputePipeline(compPip);
    gfx.applyComputeBindings({ storageBuffers: [buf] });
    gfx.dispatchWorkgroups(4);
    gfx.dispatchWorkgroups(8);
    gfx.endPass();

    // Render pass: dispatch stats must survive beginPass
    gfx.beginPass();
    gfx.endPass();

    const stats = gfx.frameStats;
    expect(stats.dispatchCalls).toBe(2);
    expect(stats.drawCalls).toBe(0);
  });

  it("resets all stats to zero after commit", async () => {
    const gfx = makeGfx();
    const shd = await gfx.makeComputeShader({
      source: "@compute @workgroup_size(64) fn cs_main() {}",
    });
    const pip = gfx.makeComputePipeline({ shader: shd });

    gfx.beginComputePass();
    gfx.applyComputePipeline(pip);
    gfx.dispatchWorkgroups(1);
    gfx.endPass();
    gfx.commit();

    const stats = gfx.frameStats;
    expect(stats.dispatchCalls).toBe(0);
    expect(stats.drawCalls).toBe(0);
    expect(stats.totalElements).toBe(0);
    expect(stats.indirectDrawCalls).toBe(0);
  });
});
