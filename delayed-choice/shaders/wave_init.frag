#version 300 es
precision highp float;

uniform ivec2 uSimRes;

uniform float uHBAR;
uniform float uMass;
uniform float uP0;
uniform float uDT;

uniform vec2  uPacketPosFrac;
uniform float uPacketSigmaPx;

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

float sqr(float x){ return x*x; }
vec2 cis(float a){ return vec2(cos(a), sin(a)); }
float kineticEnergy(){ return 0.5*sqr(uP0)/uMass; }
vec2 inputDirection(){ return normalize(vec2(1.0, -1.0)); }
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

vec2 schrodingerRHS(vec2 psi, vec2 lapPsi, float V){
  float cLap = uHBAR / (2.0*uMass);
  float cV   = V / uHBAR;
  return vec2(-cLap*lapPsi.y + cV*psi.y,
               cLap*lapPsi.x - cV*psi.x);
}

vec2 initialPacketAtPx(vec2 xPx, float t){
  vec2 innerMin, innerMax, centerPx;
  cavityBounds(innerMin, innerMax, centerPx);
  vec2 x0 = mix(innerMin, innerMax, uPacketPosFrac);
  vec2 d  = xPx - x0;

  float amp = exp(-dot(d,d)/(2.0*sqr(uPacketSigmaPx)));

  float k  = uP0/uHBAR;
  float phaseSpace = k * dot(d, inputDirection());
  float phaseTime  = -kineticEnergy() * t / uHBAR;
  return amp * cis(phaseSpace + phaseTime);
}

void main() {
  vec2 xPx = gl_FragCoord.xy;

  vec2 psi0 = initialPacketAtPx(xPx, 0.0);

  vec2 psiE = initialPacketAtPx(xPx + vec2( 1.0, 0.0), 0.0);
  vec2 psiW = initialPacketAtPx(xPx + vec2(-1.0, 0.0), 0.0);
  vec2 psiN = initialPacketAtPx(xPx + vec2( 0.0, 1.0), 0.0);
  vec2 psiS = initialPacketAtPx(xPx + vec2( 0.0,-1.0), 0.0);
  vec2 lap0 = (psiE + psiW + psiN + psiS - 4.0*psi0);

  float V = devicePotentialPx(xPx);

  vec2 rhs0 = schrodingerRHS(psi0, lap0, V);
  float W = absorbW(xPx);
  float absorbA = uDT * W / uHBAR;

  // First-order backward start-up for the leapfrog state with local damping.
  vec2 psiPrev = psi0 - uDT * rhs0 + absorbA * psi0;

  fragColor = vec4(psi0, psiPrev);
}
