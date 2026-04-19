/**
 * Minimal column-major mat4 utilities — no external dependencies.
 * All functions return a new Float32Array(16) in column-major order,
 * matching WGSL mat4x4f memory layout.
 */

export type Mat4 = Float32Array;

/** Identity matrix */
export function mat4Identity(): Mat4 {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/** Translation matrix */
export function mat4Translation(x: number, y: number, z: number): Mat4 {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

/** Rotation around X axis */
export function mat4RotateX(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // prettier-ignore
  return new Float32Array([
    1,  0, 0, 0,
    0,  c, s, 0,
    0, -s, c, 0,
    0,  0, 0, 1,
  ]);
}

/** Rotation around Y axis */
export function mat4RotateY(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // prettier-ignore
  return new Float32Array([
    c, 0, -s, 0,
    0, 1,  0, 0,
    s, 0,  c, 0,
    0, 0,  0, 1,
  ]);
}

/** Perspective projection (infinite far plane variant for clean depth values) */
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fovY / 2);
  const rangeInv = 1.0 / (near - far);
  // prettier-ignore
  return new Float32Array([
    f / aspect, 0,                          0,  0,
    0,          f,                          0,  0,
    0,          0,    (near + far) * rangeInv, -1,
    0,          0, 2 * near * far * rangeInv,  0,
  ]);
}

/** Multiply two mat4s: result = a * b (column-major) */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}
