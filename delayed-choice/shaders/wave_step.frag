#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uState;
uniform ivec2 uSimRes;

uniform float uHBAR;
uniform float uMass;
uniform float uP0;
uniform float uDT;

uniform float uSplitterXFrac;
uniform float uSplitterLengthPx;
uniform float uSplitterWidthPx;
uniform float uSplitterV0;

uniform float uDetectorXFrac;
uniform float uGuideMirrorXFrac;
uniform float uGuideMirrorLengthPx;
uniform float uGuideMirrorAngleTrim;
uniform float uGuideMirrorYTrimPx;
uniform float uGuideMirrorWidthPx;
uniform float uGuideMirrorV0;
uniform int uGuideMirrorsActive;

uniform float uMirrorThicknessPx;
uniform float uMirrorV0;

uniform float uAbsorbPx;
uniform float uAbsorbStrength;
uniform float uFallbackAbsorbPx;
uniform float uFallbackAbsorbStrength;

out vec4 fragColor;

const float PI = 3.14159265;

void cavityBounds(out vec2 innerMin, out vec2 innerMax, out vec2 centerPx){
  vec2 sim = vec2(uSimRes) - vec2(1.0);
  float sideInset = min(max(uAbsorbPx, 0.0), 0.45 * sim.x);
  innerMin = vec2(sideInset, uMirrorThicknessPx);
  innerMax = vec2(max(sideInset + 1.0, sim.x - sideInset), sim.y - uMirrorThicknessPx);
  centerPx = vec2(
    mix(innerMin.x, innerMax.x, uSplitterXFrac),
    0.5 * (innerMin.y + innerMax.y)
  );
}

float plateMask(vec2 xPx){
  vec2 innerMin, innerMax, centerPx;
  cavityBounds(innerMin, innerMax, centerPx);
  vec2 d = xPx - centerPx;

  vec2 tangent = vec2(1.0, 0.0);
  vec2 normal = vec2(0.0, 1.0);

  float along = abs(dot(d, tangent));
  float across = abs(dot(d, normal));

  float halfLength = max(0.5 * uSplitterLengthPx, 1.0);
  float halfWidth = max(0.5 * uSplitterWidthPx, 0.5);
  float feather = 2.0;

  float lenMask = 1.0 - smoothstep(halfLength, halfLength + feather, along);
  float widMask = 1.0 - smoothstep(halfWidth, halfWidth + feather, across);
  return clamp(lenMask * widMask, 0.0, 1.0);
}

float mirrorMask(vec2 xPx){
  vec2 innerMin, innerMax, centerPx;
  cavityBounds(innerMin, innerMax, centerPx);
  float feather = 2.0;

  float bottom = 1.0 - smoothstep(innerMin.y - feather, innerMin.y + feather, xPx.y);
  float top    = smoothstep(innerMax.y - feather, innerMax.y + feather, xPx.y);

  return clamp(max(bottom, top), 0.0, 1.0);
}

float guideMirrorMaskAt(vec2 xPx, float armSign){
  vec2 innerMin, innerMax, centerPx;
  cavityBounds(innerMin, innerMax, centerPx);

  float splitterX = centerPx.x;
  float detectorX = mix(innerMin.x, innerMax.x, uDetectorXFrac);
  float rawHitX = mix(innerMin.x, innerMax.x, uGuideMirrorXFrac);
  float hitMin = splitterX + 16.0;
  float hitMax = max(hitMin + 1.0, detectorX - 16.0);
  float hitX = clamp(rawHitX, hitMin, hitMax);

  float rawArmDy = max(hitX - splitterX + uGuideMirrorYTrimPx, 4.0);
  float anchorY = clamp(
    centerPx.y + armSign * rawArmDy,
    innerMin.y + 8.0,
    innerMax.y - 8.0
  );
  vec2 anchor = vec2(hitX, anchorY);

  float dxOut = max(detectorX - hitX, 1.0);
  float incidentAngle = armSign * 0.25 * PI;
  float targetAngle = atan(centerPx.y - anchorY, dxOut);
  float mirrorAngle = 0.5 * (incidentAngle + targetAngle) + armSign * uGuideMirrorAngleTrim;
  vec2 tangent = vec2(cos(mirrorAngle), sin(mirrorAngle));
  vec2 normal = vec2(-tangent.y, tangent.x);

  vec2 d = xPx - anchor;
  float along = dot(d, tangent);
  float across = abs(dot(d, normal));

  float halfLength = max(0.5 * uGuideMirrorLengthPx, 1.0);
  float halfWidth = max(0.5 * uGuideMirrorWidthPx, 0.5);
  float feather = 2.0;

  float lenMask = 1.0 - smoothstep(halfLength, halfLength + feather, abs(along));
  float widMask = 1.0 - smoothstep(halfWidth, halfWidth + feather, across);
  return clamp(lenMask * widMask, 0.0, 1.0);
}

float guideMirrorMask(vec2 xPx){
  if(uGuideMirrorsActive != 1) return 0.0;
  return max(guideMirrorMaskAt(xPx, 1.0), guideMirrorMaskAt(xPx, -1.0));
}

float devicePotentialPx(vec2 xPx){
  float splitter = uSplitterV0 * plateMask(xPx);
  float mirrors  = uMirrorV0  * mirrorMask(xPx);
  float guideMirrors = uGuideMirrorV0 * guideMirrorMask(xPx);
  return max(max(splitter, mirrors), guideMirrors);
}

float absorbW(vec2 xPx){
  float damping = 0.0;

  if(uAbsorbPx > 0.0) {
    float leftFactor = 1.20;
    float dx = min(xPx.x * leftFactor, float(uSimRes.x) - 1.0 - xPx.x);
    float t = clamp((uAbsorbPx - dx) / max(uAbsorbPx, 1.0), 0.0, 1.0);
    float s = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    damping = uAbsorbStrength * s * s;
  }

  if(uFallbackAbsorbPx > 0.0) {
    float dxRight = float(uSimRes.x) - 1.0 - xPx.x;
    float tRight = clamp(
      (uFallbackAbsorbPx - dxRight) / max(uFallbackAbsorbPx, 1.0),
      0.0,
      1.0
    );
    float sRight = tRight * tRight * tRight *
      (tRight * (tRight * 6.0 - 15.0) + 10.0);
    damping = max(damping, uFallbackAbsorbStrength * sRight * sRight);
  }

  return damping;
}

vec2 fetchPsi(ivec2 q){
  if(q.x < 0 || q.y < 0 || q.x >= uSimRes.x || q.y >= uSimRes.y) return vec2(0.0);
  return texelFetch(uState, q, 0).rg;
}

vec2 schrodingerRHS(vec2 psi, vec2 lapPsi, float V){
  float cLap = uHBAR / (2.0*uMass);
  float cV   = V / uHBAR;
  return vec2(-cLap*lapPsi.y + cV*psi.y,
               cLap*lapPsi.x - cV*psi.x);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);

  vec4 s = texelFetch(uState, p, 0);
  vec2 psi     = s.rg;
  vec2 psiPrev = s.ba;

  vec2 psiE = fetchPsi(p + ivec2( 1, 0));
  vec2 psiW = fetchPsi(p + ivec2(-1, 0));
  vec2 psiN = fetchPsi(p + ivec2( 0, 1));
  vec2 psiS = fetchPsi(p + ivec2( 0,-1));
  vec2 lapPsi = (psiE + psiW + psiN + psiS - 4.0*psi);

  vec2 xPx = vec2(p);
  float V = devicePotentialPx(xPx);
  vec2 rhs = schrodingerRHS(psi, lapPsi, V);

  float W = absorbW(xPx);
  float absorbA = uDT * W / uHBAR;

  // Time-center the local absorber so the leapfrog update stays stable
  // even when the absorbing potential is strong.
  vec2 psiNext = ((1.0 - absorbA) * psiPrev + 2.0 * uDT * rhs) / (1.0 + absorbA);

  fragColor = vec4(psiNext, psi);
}
