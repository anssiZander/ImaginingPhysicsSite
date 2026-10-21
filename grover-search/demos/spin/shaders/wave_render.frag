#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uWave;
uniform float uVisGain;
uniform float uVisGamma;
uniform int uShowPhase;
uniform vec2 uCanvasSize;
uniform int uTarget;
uniform float uGateFlash;
uniform int uGateQuadrant;

in vec2 vUV;
out vec4 fragColor;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 phasePalette(float phase, float intensity) {
  // Phase zero is red; the full 2pi cycle runs through the standard HSV rainbow.
  // A small value floor prevents any phase angle from being mapped to black.
  float hue = fract(phase / 6.28318530718 + 1.0);
  float structure = smoothstep(0.015, 0.20, intensity);
  float saturation = mix(0.28, 0.94, structure);
  float value = 0.075 + 0.925 * intensity;
  return hsv2rgb(vec3(hue, saturation, value));
}
vec3 densityPalette(float t) {
  vec3 a = vec3(0.22, 0.32, 0.28);
  vec3 b = vec3(0.40, 0.45, 0.35);
  vec3 d = vec3(0.15, 0.55, 0.75);
  return a + b * cos(6.283185 * (t + d));
}
vec2 boxUVFromScreen(vec2 screenUV, out float inside) {
  vec2 cs = max(uCanvasSize, vec2(1.0));
  float side = min(cs.x, cs.y);
  vec2 origin = 0.5 * (cs - vec2(side));
  vec2 uv = (screenUV * cs - origin) / side;
  inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  return uv;
}
float quadrantMask(vec2 uv, int q) {
  float sx = smoothstep(0.49, 0.51, uv.x);
  float sy = smoothstep(0.49, 0.51, uv.y);
  float qx = (q == 2 || q == 3) ? sx : (1.0 - sx);
  float qy = (q == 1 || q == 3) ? sy : (1.0 - sy);
  return qx * qy;
}
float quadrantBorder(vec2 uv, int q) {
  vec2 center = vec2((q == 2 || q == 3) ? 0.75 : 0.25,
                     (q == 1 || q == 3) ? 0.75 : 0.25);
  vec2 d = abs(uv - center);
  float edge = min(abs(d.x - 0.245), abs(d.y - 0.245));
  float within = step(d.x, 0.25) * step(d.y, 0.25);
  return within * (1.0 - smoothstep(0.002, 0.008, edge));
}
float quadrantGlow(vec2 uv, int q) {
  vec2 center = vec2((q == 2 || q == 3) ? 0.75 : 0.25,
                     (q == 1 || q == 3) ? 0.75 : 0.25);
  vec2 d = abs(uv - center);
  float edge = min(abs(d.x - 0.245), abs(d.y - 0.245));
  float within = step(d.x, 0.25) * step(d.y, 0.25);
  return within * (1.0 - smoothstep(0.008, 0.045, edge));
}
void main() {
  float inside;
  vec2 uv = boxUVFromScreen(vUV, inside);
  if (inside < 0.5) { fragColor = vec4(0,0,0,1); return; }
  vec2 psi = texture(uWave, uv).rg;
  float rho = dot(psi, psi);
  float I = pow(clamp(1.0 - exp(-uVisGain * rho), 0.0, 1.0), uVisGamma);
  vec3 col;
  if (uShowPhase == 1) {
    // Show the complete complex phase arg(psi), including its global rotation.
    // No phase-reference subtraction is performed.
    float ph = atan(psi.y, psi.x);
    col = phasePalette(ph, I);
  } else {
    col = densityPalette(I) * I;
  }

  float wall = min(min(uv.x, uv.y), min(1.0-uv.x, 1.0-uv.y));
  float rim = 1.0 - smoothstep(0.002, 0.009, wall);
  col = mix(col, vec3(0.35,0.94,1.0), 0.82 * rim);
  col += vec3(0.05,0.38,0.88) * exp(-wall * 96.0) * 0.30;

  float cross = max(1.0 - smoothstep(0.0015, 0.0045, abs(uv.x - 0.5)),
                    1.0 - smoothstep(0.0015, 0.0045, abs(uv.y - 0.5)));
  col = mix(col, vec3(0.18,0.55,0.72), 0.34 * cross);
  // The marked quadrant has a persistent crimson wash, broad glow, and bright
  // red edge. The phase hue and density remain visible underneath the tint.
  float targetArea = quadrantMask(uv, uTarget);
  float targetGlow = quadrantGlow(uv, uTarget);
  float targetEdge = quadrantBorder(uv, uTarget);
  col = mix(col, col * vec3(1.06, 0.76, 0.80) + vec3(0.13, 0.005, 0.012), 0.20 * targetArea);
  col += vec3(1.0,0.015,0.035) * (0.34 * targetGlow + 1.05 * targetEdge);
  col += vec3(1.0,0.28,0.72) * quadrantMask(uv, uGateQuadrant) * uGateFlash * 0.16;
  fragColor = vec4(col, 1.0);
}
