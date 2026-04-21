import { describe, it, expect } from "vitest";
import {
  getFormatInfo,
  bytesPerRowForFormat,
  requiredFeatureForFormat,
} from "../src/gfx.js";
import { PixelFormat } from "../src/types.js";

// ---------------------------------------------------------------------------
// getFormatInfo
// ---------------------------------------------------------------------------

describe("getFormatInfo", () => {
  it("returns correct info for uncompressed color formats", () => {
    const r8 = getFormatInfo(PixelFormat.R8);
    expect(r8.bytesPerBlock).toBe(1);
    expect(r8.blockWidth).toBe(1);
    expect(r8.blockHeight).toBe(1);
    expect(r8.isCompressed).toBe(false);
    expect(r8.isDepth).toBe(false);

    const rg8 = getFormatInfo(PixelFormat.RG8);
    expect(rg8.bytesPerBlock).toBe(2);

    const rgba8 = getFormatInfo(PixelFormat.RGBA8);
    expect(rgba8.bytesPerBlock).toBe(4);
    expect(rgba8.isCompressed).toBe(false);
    expect(rgba8.isDepth).toBe(false);

    const bgra8 = getFormatInfo(PixelFormat.BGRA8);
    expect(bgra8.bytesPerBlock).toBe(4);

    const rgba16f = getFormatInfo(PixelFormat.RGBA16F);
    expect(rgba16f.bytesPerBlock).toBe(8);

    const rgba32f = getFormatInfo(PixelFormat.RGBA32F);
    expect(rgba32f.bytesPerBlock).toBe(16);
  });

  it("returns correct info for depth formats", () => {
    const d24s8 = getFormatInfo(PixelFormat.DEPTH24_STENCIL8);
    expect(d24s8.bytesPerBlock).toBe(4);
    expect(d24s8.isDepth).toBe(true);
    expect(d24s8.isCompressed).toBe(false);

    const d32f = getFormatInfo(PixelFormat.DEPTH32F);
    expect(d32f.bytesPerBlock).toBe(4);
    expect(d32f.isDepth).toBe(true);
  });

  it("returns correct info for BC compressed formats (4x4 blocks)", () => {
    const bc1 = getFormatInfo(PixelFormat.BC1_RGBA);
    expect(bc1.bytesPerBlock).toBe(8);
    expect(bc1.blockWidth).toBe(4);
    expect(bc1.blockHeight).toBe(4);
    expect(bc1.isCompressed).toBe(true);
    expect(bc1.isDepth).toBe(false);

    const bc3 = getFormatInfo(PixelFormat.BC3_RGBA);
    expect(bc3.bytesPerBlock).toBe(16);
    expect(bc3.blockWidth).toBe(4);

    const bc4 = getFormatInfo(PixelFormat.BC4_R);
    expect(bc4.bytesPerBlock).toBe(8);

    const bc5 = getFormatInfo(PixelFormat.BC5_RG);
    expect(bc5.bytesPerBlock).toBe(16);

    const bc6h = getFormatInfo(PixelFormat.BC6H_RGB);
    expect(bc6h.bytesPerBlock).toBe(16);

    const bc7 = getFormatInfo(PixelFormat.BC7_RGBA);
    expect(bc7.bytesPerBlock).toBe(16);
  });

  it("returns correct info for ETC2 compressed formats", () => {
    const etc2rgb = getFormatInfo(PixelFormat.ETC2_RGB8);
    expect(etc2rgb.bytesPerBlock).toBe(8);
    expect(etc2rgb.blockWidth).toBe(4);
    expect(etc2rgb.blockHeight).toBe(4);
    expect(etc2rgb.isCompressed).toBe(true);

    const etc2rgba = getFormatInfo(PixelFormat.ETC2_RGBA8);
    expect(etc2rgba.bytesPerBlock).toBe(16);
  });

  it("returns correct info for ASTC compressed formats", () => {
    const astc4 = getFormatInfo(PixelFormat.ASTC_4X4);
    expect(astc4.bytesPerBlock).toBe(16);
    expect(astc4.blockWidth).toBe(4);
    expect(astc4.blockHeight).toBe(4);
    expect(astc4.isCompressed).toBe(true);

    const astc8 = getFormatInfo(PixelFormat.ASTC_8X8);
    expect(astc8.bytesPerBlock).toBe(16);
    expect(astc8.blockWidth).toBe(8);
    expect(astc8.blockHeight).toBe(8);
  });

  it("returns correct info for sRGB BC compressed variants (matches linear counterpart)", () => {
    const bc1 = getFormatInfo(PixelFormat.BC1_RGBA_SRGB);
    expect(bc1.bytesPerBlock).toBe(8);
    expect(bc1.blockWidth).toBe(4);
    expect(bc1.blockHeight).toBe(4);
    expect(bc1.isCompressed).toBe(true);
    expect(bc1.isDepth).toBe(false);

    const bc3 = getFormatInfo(PixelFormat.BC3_RGBA_SRGB);
    expect(bc3.bytesPerBlock).toBe(16);
    expect(bc3.blockWidth).toBe(4);

    const bc7 = getFormatInfo(PixelFormat.BC7_RGBA_SRGB);
    expect(bc7.bytesPerBlock).toBe(16);
    expect(bc7.blockWidth).toBe(4);
  });

  it("returns correct info for sRGB ETC2 compressed variants", () => {
    const etc2rgb = getFormatInfo(PixelFormat.ETC2_RGB8_SRGB);
    expect(etc2rgb.bytesPerBlock).toBe(8);
    expect(etc2rgb.blockWidth).toBe(4);
    expect(etc2rgb.blockHeight).toBe(4);
    expect(etc2rgb.isCompressed).toBe(true);

    const etc2rgba = getFormatInfo(PixelFormat.ETC2_RGBA8_SRGB);
    expect(etc2rgba.bytesPerBlock).toBe(16);
    expect(etc2rgba.blockWidth).toBe(4);
  });

  it("returns correct info for sRGB ASTC compressed variants", () => {
    const astc4 = getFormatInfo(PixelFormat.ASTC_4X4_SRGB);
    expect(astc4.bytesPerBlock).toBe(16);
    expect(astc4.blockWidth).toBe(4);
    expect(astc4.blockHeight).toBe(4);
    expect(astc4.isCompressed).toBe(true);

    const astc8 = getFormatInfo(PixelFormat.ASTC_8X8_SRGB);
    expect(astc8.bytesPerBlock).toBe(16);
    expect(astc8.blockWidth).toBe(8);
    expect(astc8.blockHeight).toBe(8);
  });

  it("returns default info for unknown/invalid format", () => {
    const unknown = getFormatInfo("nonexistent-format" as PixelFormat);
    expect(unknown.bytesPerBlock).toBe(4);
    expect(unknown.blockWidth).toBe(1);
    expect(unknown.blockHeight).toBe(1);
    expect(unknown.isCompressed).toBe(false);
    expect(unknown.isDepth).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bytesPerRowForFormat
// ---------------------------------------------------------------------------

describe("bytesPerRowForFormat", () => {
  it("computes bytes per row for uncompressed formats", () => {
    // RGBA8: 4 bytes per pixel, width=256 -> 1024 bytes
    expect(bytesPerRowForFormat(PixelFormat.RGBA8, 256)).toBe(1024);
    // R8: 1 byte per pixel, width=100 -> 100 bytes
    expect(bytesPerRowForFormat(PixelFormat.R8, 100)).toBe(100);
    // RGBA16F: 8 bytes per pixel, width=64 -> 512 bytes
    expect(bytesPerRowForFormat(PixelFormat.RGBA16F, 64)).toBe(512);
  });

  it("computes bytes per row for block-compressed formats with aligned widths", () => {
    // BC1: 8 bytes per 4x4 block, width=256 -> 256/4 * 8 = 512 bytes
    expect(bytesPerRowForFormat(PixelFormat.BC1_RGBA, 256)).toBe(512);
    // BC3: 16 bytes per 4x4 block, width=256 -> 256/4 * 16 = 1024 bytes
    expect(bytesPerRowForFormat(PixelFormat.BC3_RGBA, 256)).toBe(1024);
  });

  it("rounds up non-block-aligned widths for compressed formats", () => {
    // BC1: 8 bytes per 4x4 block, width=5 -> ceil(5/4) = 2 blocks -> 16 bytes
    expect(bytesPerRowForFormat(PixelFormat.BC1_RGBA, 5)).toBe(16);
    // BC1: width=1 -> ceil(1/4) = 1 block -> 8 bytes
    expect(bytesPerRowForFormat(PixelFormat.BC1_RGBA, 1)).toBe(8);
    // ASTC 8x8: 16 bytes per 8x8 block, width=9 -> ceil(9/8) = 2 blocks -> 32 bytes
    expect(bytesPerRowForFormat(PixelFormat.ASTC_8X8, 9)).toBe(32);
  });

  it("handles width=0 correctly", () => {
    // ceil(0/1) * 4 = 0 for RGBA8
    expect(bytesPerRowForFormat(PixelFormat.RGBA8, 0)).toBe(0);
  });

  it("handles width=1 for all format families", () => {
    expect(bytesPerRowForFormat(PixelFormat.RGBA8, 1)).toBe(4);
    expect(bytesPerRowForFormat(PixelFormat.R8, 1)).toBe(1);
    expect(bytesPerRowForFormat(PixelFormat.BC1_RGBA, 1)).toBe(8);
    expect(bytesPerRowForFormat(PixelFormat.ETC2_RGB8, 1)).toBe(8);
    expect(bytesPerRowForFormat(PixelFormat.ASTC_4X4, 1)).toBe(16);
  });

  it("computes correct bytes per row for sRGB compressed variants", () => {
    // sRGB variants must produce the same results as their linear counterparts
    expect(bytesPerRowForFormat(PixelFormat.BC1_RGBA_SRGB, 256)).toBe(512);
    expect(bytesPerRowForFormat(PixelFormat.BC3_RGBA_SRGB, 256)).toBe(1024);
    expect(bytesPerRowForFormat(PixelFormat.BC7_RGBA_SRGB, 256)).toBe(1024);
    expect(bytesPerRowForFormat(PixelFormat.ETC2_RGB8_SRGB, 256)).toBe(512);
    expect(bytesPerRowForFormat(PixelFormat.ETC2_RGBA8_SRGB, 256)).toBe(1024);
    expect(bytesPerRowForFormat(PixelFormat.ASTC_4X4_SRGB, 256)).toBe(1024);
    expect(bytesPerRowForFormat(PixelFormat.ASTC_8X8_SRGB, 256)).toBe(512);
  });
});

// ---------------------------------------------------------------------------
// requiredFeatureForFormat
// ---------------------------------------------------------------------------

describe("requiredFeatureForFormat", () => {
  it("returns null for uncompressed formats", () => {
    expect(requiredFeatureForFormat(PixelFormat.RGBA8)).toBeNull();
    expect(requiredFeatureForFormat(PixelFormat.BGRA8)).toBeNull();
    expect(requiredFeatureForFormat(PixelFormat.R8)).toBeNull();
    expect(requiredFeatureForFormat(PixelFormat.RG8)).toBeNull();
    expect(requiredFeatureForFormat(PixelFormat.RGBA16F)).toBeNull();
    expect(requiredFeatureForFormat(PixelFormat.RGBA32F)).toBeNull();
  });

  it("returns null for depth formats", () => {
    expect(requiredFeatureForFormat(PixelFormat.DEPTH24_STENCIL8)).toBeNull();
    expect(requiredFeatureForFormat(PixelFormat.DEPTH32F)).toBeNull();
  });

  it("returns texture-compression-bc for all BC formats", () => {
    const bcFormats = [
      PixelFormat.BC1_RGBA,
      PixelFormat.BC3_RGBA,
      PixelFormat.BC4_R,
      PixelFormat.BC5_RG,
      PixelFormat.BC6H_RGB,
      PixelFormat.BC7_RGBA,
    ];
    for (const fmt of bcFormats) {
      expect(requiredFeatureForFormat(fmt)).toBe("texture-compression-bc");
    }
  });

  it("returns texture-compression-etc2 for ETC2 formats", () => {
    expect(requiredFeatureForFormat(PixelFormat.ETC2_RGB8)).toBe("texture-compression-etc2");
    expect(requiredFeatureForFormat(PixelFormat.ETC2_RGBA8)).toBe("texture-compression-etc2");
  });

  it("returns texture-compression-astc for ASTC formats", () => {
    expect(requiredFeatureForFormat(PixelFormat.ASTC_4X4)).toBe("texture-compression-astc");
    expect(requiredFeatureForFormat(PixelFormat.ASTC_8X8)).toBe("texture-compression-astc");
  });

  it("returns texture-compression-bc for sRGB BC variants", () => {
    expect(requiredFeatureForFormat(PixelFormat.BC1_RGBA_SRGB)).toBe("texture-compression-bc");
    expect(requiredFeatureForFormat(PixelFormat.BC3_RGBA_SRGB)).toBe("texture-compression-bc");
    expect(requiredFeatureForFormat(PixelFormat.BC7_RGBA_SRGB)).toBe("texture-compression-bc");
  });

  it("returns texture-compression-etc2 for sRGB ETC2 variants", () => {
    expect(requiredFeatureForFormat(PixelFormat.ETC2_RGB8_SRGB)).toBe("texture-compression-etc2");
    expect(requiredFeatureForFormat(PixelFormat.ETC2_RGBA8_SRGB)).toBe("texture-compression-etc2");
  });

  it("returns texture-compression-astc for sRGB ASTC variants", () => {
    expect(requiredFeatureForFormat(PixelFormat.ASTC_4X4_SRGB)).toBe("texture-compression-astc");
    expect(requiredFeatureForFormat(PixelFormat.ASTC_8X8_SRGB)).toBe("texture-compression-astc");
  });
});
