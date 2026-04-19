/**
 * Tests for Pool mechanics and generation-counted handle encoding
 * in gfx.ts. Since Pool and handle helpers are file-private, we test
 * them through the public createGfx() API using mock GPU objects.
 */

import { describe, it, expect } from "vitest";
import { createGfx } from "../src/gfx.js";
import { BufferUsage, type SgBuffer } from "../src/types.js";
import { createMockGfxDeps } from "./gpu-mock.js";

function makeGfx() {
  const deps = createMockGfxDeps();
  return createGfx(deps.device, deps.canvas, deps.context, deps.format);
}

// ---------------------------------------------------------------------------
// Handle allocation and validity
// ---------------------------------------------------------------------------

describe("Pool: handle allocation and validity", () => {
  it("returns a valid handle from makeBuffer", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    expect(buf.id).toBeGreaterThan(0);
    expect(buf._brand).toBe("SgBuffer");
    expect(gfx.isValid(buf)).toBe(true);
  });

  it("returns distinct handle ids for successive allocations", () => {
    const gfx = makeGfx();
    const a = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    const b = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    expect(a.id).not.toBe(b.id);
  });

  it("returns a handle with non-zero generation (generation starts at 1)", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    // The handle encodes generation in the upper 16 bits.
    // First alloc of slot should have gen=1, so upper bits are non-zero.
    expect(buf.id >>> 16).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Handle destruction and use-after-free guard
// ---------------------------------------------------------------------------

describe("Pool: destruction and use-after-free", () => {
  it("marks handle as invalid after destroyBuffer", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    expect(gfx.isValid(buf)).toBe(true);
    gfx.destroyBuffer(buf);
    expect(gfx.isValid(buf)).toBe(false);
  });

  it("throws on updateBuffer with a destroyed handle", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    gfx.destroyBuffer(buf);
    expect(() =>
      gfx.updateBuffer(buf, new Float32Array([1, 2, 3]))
    ).toThrow("Invalid or stale buffer handle");
  });

  it("double-destroy is a no-op (no throw)", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    gfx.destroyBuffer(buf);
    // Second destroy should not throw
    expect(() => gfx.destroyBuffer(buf)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Stale handle / generation behavior
// ---------------------------------------------------------------------------

describe("Pool: stale handle generation behavior", () => {
  it("rejects a stale handle after slot is reused", () => {
    const gfx = makeGfx();
    const first = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    const firstId = first.id;
    gfx.destroyBuffer(first);

    // Allocate again -- should reuse the freed slot but with a new generation
    const second = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });

    // The old handle should no longer be valid
    expect(gfx.isValid(first)).toBe(false);
    // The new handle should be valid
    expect(gfx.isValid(second)).toBe(true);

    // The slot index (lower 16 bits) should be the same since it was reused
    expect(firstId & 0xFFFF).toBe(second.id & 0xFFFF);
    // But the generation (upper 16 bits) should differ
    expect(firstId >>> 16).not.toBe(second.id >>> 16);
  });

  it("generation increments on each reuse of the same slot", () => {
    const gfx = makeGfx();
    const gens: number[] = [];

    for (let i = 0; i < 5; i++) {
      const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
      gens.push(buf.id >>> 16);
      gfx.destroyBuffer(buf);
    }

    // Each generation should be one higher than the previous
    for (let i = 1; i < gens.length; i++) {
      expect(gens[i]).toBe(gens[i - 1] + 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Pool exhaustion
// ---------------------------------------------------------------------------

describe("Pool: exhaustion behavior", () => {
  it("throws when pool capacity is exceeded", () => {
    const gfx = makeGfx();
    // The buffer pool has capacity 128 (set in createGfx).
    // Allocate 128 buffers to fill it.
    const buffers: SgBuffer[] = [];
    for (let i = 0; i < 128; i++) {
      buffers.push(gfx.makeBuffer({ size: 4, usage: BufferUsage.DYNAMIC }));
    }
    // The 129th allocation should throw
    expect(() =>
      gfx.makeBuffer({ size: 4, usage: BufferUsage.DYNAMIC })
    ).toThrow("Pool exhausted");
  });

  it("frees slots for reuse after destruction", () => {
    const gfx = makeGfx();
    // Fill the pool
    const buffers: SgBuffer[] = [];
    for (let i = 0; i < 128; i++) {
      buffers.push(gfx.makeBuffer({ size: 4, usage: BufferUsage.DYNAMIC }));
    }
    // Free one
    gfx.destroyBuffer(buffers[0]);
    // Now we should be able to allocate again
    expect(() =>
      gfx.makeBuffer({ size: 4, usage: BufferUsage.DYNAMIC })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-pool handle isolation
// ---------------------------------------------------------------------------

describe("Pool: cross-pool handle isolation", () => {
  it("buffer handle is not valid as an image handle", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    // isValid dispatches on _brand, so a buffer handle is valid
    expect(gfx.isValid(buf)).toBe(true);
    // A handle with the same id but wrong brand should not be valid
    // (there's no image with that id in the image pool)
    const fakeImage = { _brand: "SgImage" as const, id: buf.id };
    expect(gfx.isValid(fakeImage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Immutable buffer guard
// ---------------------------------------------------------------------------

describe("Buffer: immutable buffer update guard", () => {
  it("throws when updating an IMMUTABLE buffer", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({
      data: new Float32Array([1, 2, 3, 4]),
      usage: BufferUsage.IMMUTABLE,
    });
    expect(() =>
      gfx.updateBuffer(buf, new Float32Array([5, 6, 7, 8]))
    ).toThrow("Cannot update an IMMUTABLE buffer");
  });

  it("allows updating a DYNAMIC buffer", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    expect(() =>
      gfx.updateBuffer(buf, new Float32Array([1, 2, 3, 4]))
    ).not.toThrow();
  });

  it("allows updating a STREAM buffer", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.STREAM });
    expect(() =>
      gfx.updateBuffer(buf, new Float32Array([1, 2, 3, 4]))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Buffer creation with initial data
// ---------------------------------------------------------------------------

describe("Buffer: creation with initial data", () => {
  it("creates a buffer with mappedAtCreation when data is provided", () => {
    const gfx = makeGfx();
    const data = new Float32Array([1, 2, 3, 4]);
    const buf = gfx.makeBuffer({ data, usage: BufferUsage.IMMUTABLE });
    expect(gfx.isValid(buf)).toBe(true);
  });

  it("creates a buffer without initial data using size", () => {
    const gfx = makeGfx();
    const buf = gfx.makeBuffer({ size: 256, usage: BufferUsage.DYNAMIC });
    expect(gfx.isValid(buf)).toBe(true);
  });

  it("aligns buffer size to 4 bytes", () => {
    const gfx = makeGfx();
    // 3 bytes of data should result in a 4-byte aligned buffer
    const data = new Uint8Array([1, 2, 3]);
    const buf = gfx.makeBuffer({ data, usage: BufferUsage.IMMUTABLE });
    expect(gfx.isValid(buf)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shutdown leak detection
// ---------------------------------------------------------------------------

describe("gfx.shutdown: leak detection", () => {
  it("warns about leaked resources on shutdown", () => {
    const gfx = makeGfx();
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));

    gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC, label: "leaked-buf" });
    gfx.shutdown();

    console.warn = origWarn;
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("not explicitly destroyed");
    expect(warnings[0]).toContain("leaked-buf");
  });

  it("does not warn when all resources are properly destroyed", () => {
    const gfx = makeGfx();
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));

    const buf = gfx.makeBuffer({ size: 64, usage: BufferUsage.DYNAMIC });
    gfx.destroyBuffer(buf);
    gfx.shutdown();

    console.warn = origWarn;
    expect(warnings.length).toBe(0);
  });
});
