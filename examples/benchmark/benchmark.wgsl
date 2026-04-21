struct Uniforms {
  offset_and_scale: vec4f,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertIn {
  @location(0) pos: vec2f,
}

struct VertOut {
  @builtin(position) pos: vec4f,
  @location(0) col: vec3f,
}

@vertex fn vs_main(v: VertIn) -> VertOut {
  let scaled = v.pos * u.offset_and_scale.z;
  let world_pos = scaled + u.offset_and_scale.xy;
  return VertOut(vec4f(world_pos, 0.0, 1.0), u.color.rgb);
}

@fragment fn fs_main(@location(0) col: vec3f) -> @location(0) vec4f {
  return vec4f(col, 1.0);
}
