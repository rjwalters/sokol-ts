// Per-vertex attributes (from buffer 0, step_mode = vertex)
struct VertIn {
  @location(0) pos: vec2f,
}

// Per-instance attributes (from buffer 1, step_mode = instance)
struct InstIn {
  @location(1) offset_and_scale: vec3f,  // xy = offset, z = scale
  @location(2) color: vec3f,
}

struct VertOut {
  @builtin(position) pos: vec4f,
  @location(0) col: vec3f,
}

struct Uniforms {
  aspect: f32,
  time: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex fn vs_main(v: VertIn, inst: InstIn) -> VertOut {
  let offset = inst.offset_and_scale.xy;
  let scale = inst.offset_and_scale.z;

  // Rotate each instance based on time
  let angle = u.time + offset.x * 3.14159;
  let c = cos(angle);
  let s = sin(angle);
  let rotated = vec2f(
    v.pos.x * c - v.pos.y * s,
    v.pos.x * s + v.pos.y * c,
  );

  var p = rotated * scale + offset;
  // Correct for aspect ratio so shapes stay square
  p.x /= u.aspect;

  return VertOut(vec4f(p, 0.0, 1.0), inst.color);
}

@fragment fn fs_main(@location(0) col: vec3f) -> @location(0) vec4f {
  return vec4f(col, 1.0);
}
