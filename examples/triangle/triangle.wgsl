struct VertIn {
  @location(0) pos: vec2f,
  @location(1) col: vec3f,
}

struct VertOut {
  @builtin(position) pos: vec4f,
  @location(0) col: vec3f,
}

@vertex fn vs_main(v: VertIn) -> VertOut {
  return VertOut(vec4f(v.pos, 0.0, 1.0), v.col);
}

@fragment fn fs_main(@location(0) col: vec3f) -> @location(0) vec4f {
  return vec4f(col, 1.0);
}
