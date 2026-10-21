#version 300 es
precision highp float;
precision highp sampler2D;

layout(location=0) in vec4 aState;
out vec4 vState;

uniform sampler2D uWave;
uniform float uDT;
uniform float uHbar;
uniform float uMass;
uniform float uRhoMin;
uniform float uVelClamp;
uniform int uFreeze;

vec2 samplePsi(vec2 uv) { return texture(uWave, clamp(uv, vec2(0.0), vec2(1.0))).rg; }

vec2 velocity(vec2 uv) {
  ivec2 size = textureSize(uWave, 0);
  vec2 texel = 1.0 / vec2(size - 1);
  vec2 psi = samplePsi(uv);
  vec2 dx = (samplePsi(uv + vec2(texel.x,0.0)) - samplePsi(uv - vec2(texel.x,0.0))) / (2.0 * texel.x);
  vec2 dy = (samplePsi(uv + vec2(0.0,texel.y)) - samplePsi(uv - vec2(0.0,texel.y))) / (2.0 * texel.y);
  float rho = max(dot(psi, psi), uRhoMin);
  vec2 v = (uHbar / max(uMass, 1e-8)) * vec2(
    psi.x * dx.y - psi.y * dx.x,
    psi.x * dy.y - psi.y * dy.x
  ) / rho;
  float s = length(v);
  if (uVelClamp > 0.0 && s > uVelClamp) v *= uVelClamp / s;
  return v;
}

float reflect1(float x) {
  float v = mod(x, 2.0);
  if (v < 0.0) v += 2.0;
  return (v <= 1.0) ? v : 2.0 - v;
}

void main() {
  if (aState.z < 0.5 || uFreeze == 1) {
    vState = aState;
    gl_Position = vec4(-2.0);
    return;
  }
  vec2 q = clamp(aState.xy, vec2(1e-4), vec2(1.0-1e-4));
  vec2 v = velocity(q);
  q += uDT * v;
  q = vec2(reflect1(q.x), reflect1(q.y));
  q = clamp(q, vec2(1e-4), vec2(1.0-1e-4));
  vState = vec4(q, 1.0, aState.w);
  gl_Position = vec4(-2.0);
}
