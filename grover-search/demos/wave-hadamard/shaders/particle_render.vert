#version 300 es
precision highp float;
layout(location=0) in vec4 aState;
uniform float uPointSize;
uniform int uNumParticles;
uniform float uTrailWidth;
uniform vec2 uCanvasSize;
out float vAlive;
out float vParticleId;
vec2 uvToNdc(vec2 uv) {
  vec2 cs = max(uCanvasSize, vec2(1.0));
  float side = min(cs.x, cs.y);
  vec2 origin = 0.5 * (cs - vec2(side));
  return (origin + uv * side) / cs * 2.0 - 1.0;
}
void main() {
  vAlive = aState.z;
  vParticleId = float(gl_VertexID) / float(max(uNumParticles, 1));
  gl_Position = vec4(uvToNdc(aState.xy), 0.0, 1.0);
  gl_PointSize = (uTrailWidth > 0.0) ? uTrailWidth : uPointSize;
}
