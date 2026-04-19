import { describe, it, expect } from "vitest";
import {
  VertexFormat,
  IndexType,
  PrimitiveType,
  CullMode,
  CompareFunc,
  FilterMode,
  WrapMode,
  PixelFormat,
  LoadAction,
  StoreAction,
  BufferUsage,
  AppEventType,
} from "../src/types.js";

describe("VertexFormat", () => {
  it("maps to correct WebGPU vertex format strings", () => {
    expect(VertexFormat.FLOAT2).toBe("float32x2");
    expect(VertexFormat.FLOAT3).toBe("float32x3");
    expect(VertexFormat.FLOAT4).toBe("float32x4");
    expect(VertexFormat.UBYTE4N).toBe("unorm8x4");
  });

  it("has exactly 4 members", () => {
    const values = Object.values(VertexFormat);
    expect(values).toHaveLength(4);
  });
});

describe("IndexType", () => {
  it("has numeric values for NONE, UINT16, UINT32", () => {
    expect(IndexType.NONE).toBe(0);
    expect(IndexType.UINT16).toBe(1);
    expect(IndexType.UINT32).toBe(2);
  });
});

describe("PrimitiveType", () => {
  it("maps to correct WebGPU primitive topology strings", () => {
    expect(PrimitiveType.TRIANGLES).toBe("triangle-list");
    expect(PrimitiveType.TRIANGLE_STRIP).toBe("triangle-strip");
    expect(PrimitiveType.LINES).toBe("line-list");
    expect(PrimitiveType.LINE_STRIP).toBe("line-strip");
    expect(PrimitiveType.POINTS).toBe("point-list");
  });

  it("has exactly 5 members", () => {
    const values = Object.values(PrimitiveType);
    expect(values).toHaveLength(5);
  });
});

describe("CullMode", () => {
  it("maps to correct WebGPU cull mode strings", () => {
    expect(CullMode.NONE).toBe("none");
    expect(CullMode.FRONT).toBe("front");
    expect(CullMode.BACK).toBe("back");
  });
});

describe("CompareFunc", () => {
  it("maps to correct WebGPU compare function strings", () => {
    expect(CompareFunc.NEVER).toBe("never");
    expect(CompareFunc.LESS).toBe("less");
    expect(CompareFunc.EQUAL).toBe("equal");
    expect(CompareFunc.LESS_EQUAL).toBe("less-equal");
    expect(CompareFunc.GREATER).toBe("greater");
    expect(CompareFunc.NOT_EQUAL).toBe("not-equal");
    expect(CompareFunc.GREATER_EQUAL).toBe("greater-equal");
    expect(CompareFunc.ALWAYS).toBe("always");
  });

  it("has exactly 8 members", () => {
    const values = Object.values(CompareFunc);
    expect(values).toHaveLength(8);
  });
});

describe("FilterMode", () => {
  it("maps to correct WebGPU filter mode strings", () => {
    expect(FilterMode.NEAREST).toBe("nearest");
    expect(FilterMode.LINEAR).toBe("linear");
  });
});

describe("WrapMode", () => {
  it("maps to correct WebGPU address mode strings", () => {
    expect(WrapMode.REPEAT).toBe("repeat");
    expect(WrapMode.CLAMP).toBe("clamp-to-edge");
    expect(WrapMode.MIRROR).toBe("mirror-repeat");
  });
});

describe("PixelFormat", () => {
  it("maps to correct WebGPU texture format strings", () => {
    expect(PixelFormat.RGBA8).toBe("rgba8unorm");
    expect(PixelFormat.BGRA8).toBe("bgra8unorm");
    expect(PixelFormat.DEPTH24_STENCIL8).toBe("depth24plus-stencil8");
    expect(PixelFormat.DEPTH32F).toBe("depth32float");
    expect(PixelFormat.R8).toBe("r8unorm");
    expect(PixelFormat.RG8).toBe("rg8unorm");
    expect(PixelFormat.RGBA16F).toBe("rgba16float");
    expect(PixelFormat.RGBA32F).toBe("rgba32float");
  });

  it("has exactly 8 members", () => {
    const values = Object.values(PixelFormat);
    expect(values).toHaveLength(8);
  });
});

describe("LoadAction", () => {
  it("has numeric values", () => {
    expect(LoadAction.CLEAR).toBe(0);
    expect(LoadAction.LOAD).toBe(1);
    expect(LoadAction.DONTCARE).toBe(2);
  });
});

describe("StoreAction", () => {
  it("has numeric values", () => {
    expect(StoreAction.STORE).toBe(0);
    expect(StoreAction.DISCARD).toBe(1);
  });
});

describe("BufferUsage", () => {
  it("has numeric values", () => {
    expect(BufferUsage.IMMUTABLE).toBe(0);
    expect(BufferUsage.DYNAMIC).toBe(1);
    expect(BufferUsage.STREAM).toBe(2);
    expect(BufferUsage.INDIRECT).toBe(3);
  });
});

describe("AppEventType", () => {
  it("maps to correct DOM event type strings", () => {
    expect(AppEventType.KEY_DOWN).toBe("keydown");
    expect(AppEventType.KEY_UP).toBe("keyup");
    expect(AppEventType.MOUSE_DOWN).toBe("mousedown");
    expect(AppEventType.MOUSE_UP).toBe("mouseup");
    expect(AppEventType.MOUSE_MOVE).toBe("mousemove");
    expect(AppEventType.MOUSE_WHEEL).toBe("wheel");
    expect(AppEventType.RESIZE).toBe("resize");
    expect(AppEventType.TOUCH_START).toBe("touchstart");
    expect(AppEventType.TOUCH_MOVE).toBe("touchmove");
    expect(AppEventType.TOUCH_END).toBe("touchend");
  });

  it("has exactly 10 members", () => {
    const values = Object.values(AppEventType);
    expect(values).toHaveLength(10);
  });
});
