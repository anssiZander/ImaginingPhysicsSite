#version 300 es
precision highp float;
void main() {
  // One full-screen triangle; the grid is a reference backdrop behind the masses.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
