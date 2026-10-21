#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uWave;
uniform vec2 uCanvasSize;
uniform int uArrowGrid;
uniform float uGain;
uniform float uLengthScale;
uniform float uThicknessScale;
uniform float uRhoMin;
uniform float uMixingSign;

out vec2 vLocal;
flat out vec4 vShape;   // total length, shaft radius, head length, head half-width
flat out float vAlpha;
flat out float vStrength;
flat out float vPhase;

vec2 samplePsi(vec2 uv) {
  return texture(uWave, clamp(uv, vec2(0.0), vec2(1.0))).rg;
}

vec2 uvToClip(vec2 uv) {
  vec2 cs = max(uCanvasSize, vec2(1.0));
  float side = min(cs.x, cs.y);
  vec2 origin = 0.5 * (cs - vec2(side));
  vec2 pixel = origin + uv * side;
  return 2.0 * pixel / cs - 1.0;
}

void main() {
  int n = max(uArrowGrid, 1);
  int ix = gl_InstanceID % n;
  int iy = gl_InstanceID / n;

  float margin = 0.035;
  float usable = 1.0 - 2.0 * margin;
  vec2 center = vec2(float(ix) + 0.5, float(iy) + 0.5) / float(n);
  center = vec2(margin) + usable * center;

  ivec2 texSize = textureSize(uWave, 0);
  vec2 texel = 1.0 / vec2(texSize - 1);
  vec2 psi = samplePsi(center);
  vec2 dx = (samplePsi(center + vec2(texel.x, 0.0)) - samplePsi(center - vec2(texel.x, 0.0))) / (2.0 * texel.x);
  vec2 dy = (samplePsi(center + vec2(0.0, texel.y)) - samplePsi(center - vec2(0.0, texel.y))) / (2.0 * texel.y);

  float rho = dot(psi, psi);
  float safeRho = max(rho, 1e-12);
  vec2 gradS = vec2(
    psi.x * dx.y - psi.y * dx.x,
    psi.x * dy.y - psi.y * dy.x
  ) / safeRho;

  float magnitude = length(gradS);
  float strength = 1.0 - exp(-max(uGain, 0.0) * magnitude);
  float densityMask = smoothstep(uRhoMin, max(8.0 * uRhoMin, uRhoMin + 1e-8), rho);
  float visible = densityMask * smoothstep(0.006, 0.03, strength);

  vec2 dir = magnitude > 1e-10 ? uMixingSign * gradS / magnitude : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float cell = usable / float(n);

  float totalLength = max(cell * 0.08, cell * uLengthScale * strength);
  float shaftRadius = cell * uThicknessScale * (0.016 + 0.032 * strength);
  float headLength = min(totalLength * 0.38, shaftRadius * 5.6);
  float headHalfWidth = shaftRadius * 2.65;

  // A little transparent room around the shape is required for derivative AA.
  float pad = max(cell * 0.012, shaftRadius * 0.8);
  float halfX = 0.5 * totalLength + pad;
  float halfY = headHalfWidth + pad;

  const vec2 corners[6] = vec2[6](
    vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0),
    vec2(-1.0,  1.0), vec2( 1.0, -1.0), vec2( 1.0,  1.0)
  );
  vec2 local = corners[gl_VertexID] * vec2(halfX, halfY);
  vec2 p = center + dir * local.x + normal * local.y;

  p = mix(center, p, visible);
  gl_Position = vec4(uvToClip(p), 0.0, 1.0);

  vLocal = local;
  vShape = vec4(totalLength, shaftRadius, headLength, headHalfWidth);
  vAlpha = visible;
  vStrength = strength;
  vPhase = atan(psi.y, psi.x);
}
