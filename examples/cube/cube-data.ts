/**
 * Cube geometry: 24 vertices (4 per face × 6 faces), 36 indices (6 per face).
 * Each face has a distinct flat colour so depth ordering is visually clear.
 * Vertex layout: [x, y, z, r, g, b]  — 6 floats = 24 bytes per vertex.
 */

// prettier-ignore
export const CUBE_VERTICES = new Float32Array([
  // +Z face  (front)  — red
  -1, -1,  1,   1, 0.2, 0.2,
   1, -1,  1,   1, 0.2, 0.2,
   1,  1,  1,   1, 0.2, 0.2,
  -1,  1,  1,   1, 0.2, 0.2,

  // -Z face  (back)   — cyan
  -1, -1, -1,   0.2, 1, 1,
  -1,  1, -1,   0.2, 1, 1,
   1,  1, -1,   0.2, 1, 1,
   1, -1, -1,   0.2, 1, 1,

  // +Y face  (top)    — green
  -1,  1, -1,   0.2, 1, 0.2,
  -1,  1,  1,   0.2, 1, 0.2,
   1,  1,  1,   0.2, 1, 0.2,
   1,  1, -1,   0.2, 1, 0.2,

  // -Y face  (bottom) — magenta
  -1, -1, -1,   1, 0.2, 1,
   1, -1, -1,   1, 0.2, 1,
   1, -1,  1,   1, 0.2, 1,
  -1, -1,  1,   1, 0.2, 1,

  // +X face  (right)  — blue
   1, -1, -1,   0.2, 0.4, 1,
   1,  1, -1,   0.2, 0.4, 1,
   1,  1,  1,   0.2, 0.4, 1,
   1, -1,  1,   0.2, 0.4, 1,

  // -X face  (left)   — yellow
  -1, -1, -1,   1, 1, 0.2,
  -1, -1,  1,   1, 1, 0.2,
  -1,  1,  1,   1, 1, 0.2,
  -1,  1, -1,   1, 1, 0.2,
]);

// Two triangles per face, 6 faces → 36 indices
// prettier-ignore
export const CUBE_INDICES = new Uint16Array([
   0,  1,  2,   0,  2,  3,  // front
   4,  5,  6,   4,  6,  7,  // back
   8,  9, 10,   8, 10, 11,  // top
  12, 13, 14,  12, 14, 15,  // bottom
  16, 17, 18,  16, 18, 19,  // right
  20, 21, 22,  20, 22, 23,  // left
]);
