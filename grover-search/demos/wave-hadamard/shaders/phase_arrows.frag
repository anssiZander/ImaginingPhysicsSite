#version 300 es
precision highp float;

in vec2 vLocal;
flat in vec4 vShape;
flat in float vAlpha;
flat in float vStrength;
flat in float vPhase;
out vec4 fragColor;

const float TAU = 6.28318530718;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// Signed distance to a triangle, adapted to an arbitrary 2D triangle.
float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0;
  vec2 e1 = p2 - p1;
  vec2 e2 = p0 - p2;
  vec2 v0 = p - p0;
  vec2 v1 = p - p1;
  vec2 v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / max(dot(e0, e0), 1e-12), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / max(dot(e1, e1), 1e-12), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / max(dot(e2, e2), 1e-12), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(
    vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
    vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
    vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

void main() {
  float totalLength = vShape.x;
  float shaftRadius = vShape.y;
  float headLength = vShape.z;
  float headHalfWidth = vShape.w;

  float tailX = -0.5 * totalLength;
  float tipX = 0.5 * totalLength;
  float baseX = tipX - headLength;

  // Rounded shaft joins slightly underneath the head so there is no seam.
  float shaftEnd = baseX + 0.30 * headLength;
  float dShaft = sdCapsule(vLocal,
    vec2(tailX + shaftRadius, 0.0),
    vec2(shaftEnd, 0.0),
    shaftRadius);
  float dHead = sdTriangle(vLocal,
    vec2(baseX, -headHalfWidth),
    vec2(tipX, 0.0),
    vec2(baseX, headHalfWidth));
  float d = min(dShaft, dHead);

  // Derivative-based coverage gives smooth edges at every canvas scale.
  float aa = max(fwidth(d) * 1.15, 1e-6);
  float coverage = 1.0 - smoothstep(-aa, aa, d);
  if (coverage <= 0.001 || vAlpha <= 0.001) discard;

  // Complementary local phase hue: vivid, varied, and readable over the wave.
  float phaseHue = fract(vPhase / TAU + 1.0);
  float arrowHue = fract(phaseHue + 0.5);
  vec3 chroma = hsv2rgb(vec3(arrowHue, 0.76, 1.0));
  vec3 color = mix(vec3(1.0), chroma, 0.82);

  float alpha = coverage * vAlpha * mix(0.72, 0.96, vStrength);
  fragColor = vec4(color, alpha);
}
