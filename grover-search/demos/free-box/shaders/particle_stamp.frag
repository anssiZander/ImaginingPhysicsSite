#version 300 es
precision highp float;
in float vAlive;
in float vParticleId;
out vec4 fragColor;
uniform float uDotSigma;
uniform float uDotGain;
uniform float uStampGain;
void main() {
  if (vAlive < 0.5) discard;
  vec2 p = gl_PointCoord - vec2(0.5);
  float r = length(p);
  if (r > 0.5) discard;
  float edge = smoothstep(0.5,0.42,r);
  float blur = exp(-(r*r)/max(uDotSigma,1e-4));
  float a = clamp(uDotGain*uStampGain*blur*edge,0.0,1.0);
  fragColor = vec4(1.0,1.0,0.0,a);
}
