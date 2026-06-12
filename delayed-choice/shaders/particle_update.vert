#version 300 es
precision highp float;
precision highp sampler2D;

layout(location=0) in vec4 aState;   // xPx, yPx, alive, transmitted
out vec4 vState;                     // xPx, yPx, alive, transmitted

uniform sampler2D uState;
uniform ivec2 uSimRes;

uniform float uHBAR;
uniform float uMass;
uniform float uP0;
uniform float uDT;
uniform int uGuidingMode;
uniform float uSpinS;

uniform float uSplitterXFrac;
uniform float uSplitterLengthPx;
uniform float uSplitterWidthPx;
uniform float uMirrorThicknessPx;
uniform float uDetectorXFrac;
uniform float uDetectionXFrac;
uniform float uDetectorLengthPx;
uniform int uDetectorActive;
uniform float uGuideMirrorXFrac;
uniform float uGuideMirrorLengthPx;
uniform float uGuideMirrorAngleTrim;
uniform float uGuideMirrorYTrimPx;
uniform float uGuideMirrorWidthPx;
uniform int uGuideMirrorsActive;
uniform float uParticleKillMarginPx;
uniform float uAbsorbPx;
uniform float uRhoMin;
uniform float uVelClamp;

const float PI = 3.14159265;

void cavityBounds(out vec2 innerMin, out vec2 innerMax){
  vec2 sim = vec2(uSimRes) - vec2(1.0);
  float sideInset = min(max(uAbsorbPx, 0.0), 0.45 * sim.x);
  innerMin = vec2(sideInset, uMirrorThicknessPx + 1.0);
  innerMax = vec2(max(sideInset + 1.0, sim.x - sideInset), sim.y - (uMirrorThicknessPx + 1.0));
}

void domainBounds(out vec2 innerMin, out vec2 innerMax){
  vec2 sim = vec2(uSimRes) - vec2(1.0);
  innerMin = vec2(0.0, uMirrorThicknessPx + 1.0);
  innerMax = vec2(sim.x, sim.y - (uMirrorThicknessPx + 1.0));
}

vec2 samplePsiBilinear(vec2 xPx)
{
  vec2 maxX = vec2(uSimRes) - vec2(1.0001);
  vec2 x = clamp(xPx, vec2(0.0), maxX);

  vec2 x0 = floor(x);
  vec2 f  = x - x0;

  ivec2 p00 = ivec2(x0);
  ivec2 p10 = min(p00 + ivec2(1,0), uSimRes - ivec2(1));
  ivec2 p01 = min(p00 + ivec2(0,1), uSimRes - ivec2(1));
  ivec2 p11 = min(p00 + ivec2(1,1), uSimRes - ivec2(1));

  vec2 a = texelFetch(uState, p00, 0).rg;
  vec2 b = texelFetch(uState, p10, 0).rg;
  vec2 c = texelFetch(uState, p01, 0).rg;
  vec2 d = texelFetch(uState, p11, 0).rg;

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec2 schrodingerVelocity(vec2 psi, vec2 dpsidx, vec2 dpsidy, float rhoEff) {
  float a = psi.x;
  float b = psi.y;

  float jx = (uHBAR / uMass) * (a * dpsidx.y - b * dpsidx.x);
  float jy = (uHBAR / uMass) * (a * dpsidy.y - b * dpsidy.x);

  return vec2(jx, jy) / rhoEff;
}

vec2 pauliSpinCorrection(float rhoEff, float drhodx, float drhody) {
  // Fixed +/-z spinor with no magnetic field: Pauli adds the spin-current curl.
  return uSpinS * (uHBAR / uMass) * vec2(drhody, -drhodx) / rhoEff;
}

vec2 guidingVelocity(vec2 xPx)
{
  vec2 psi = samplePsiBilinear(xPx);
  vec2 psiE = samplePsiBilinear(xPx + vec2(1.0, 0.0));
  vec2 psiW = samplePsiBilinear(xPx + vec2(-1.0, 0.0));
  vec2 psiN = samplePsiBilinear(xPx + vec2(0.0, 1.0));
  vec2 psiS = samplePsiBilinear(xPx + vec2(0.0, -1.0));

  vec2 dpsidx = 0.5 * (psiE - psiW);
  vec2 dpsidy = 0.5 * (psiN - psiS);

  float rho = dot(psi, psi);
  float rhoEff = max(rho, max(uRhoMin, 1e-5));

  vec2 v = schrodingerVelocity(psi, dpsidx, dpsidy, rhoEff);

  float spinSign = 0.0;
  if (uGuidingMode == 1) {
    spinSign = 1.0;
  } else if (uGuidingMode == 2) {
    spinSign = -1.0;
  }

  if (spinSign != 0.0) {
    float rhoE = dot(psiE, psiE);
    float rhoW = dot(psiW, psiW);
    float rhoN = dot(psiN, psiN);
    float rhoS = dot(psiS, psiS);
    float drhodx = 0.5 * (rhoE - rhoW);
    float drhody = 0.5 * (rhoN - rhoS);
    v += spinSign * pauliSpinCorrection(rhoEff, drhodx, drhody);
  }

  float beamSpeed = abs(uP0) / max(uMass, 1e-6);
  float stableClamp = max(8.0, 2.5 * beamSpeed + 4.0);
  float velLimit = min(uVelClamp, stableClamp);
  float sp = length(v);
  if (sp > velLimit) v *= (velLimit / sp);

  return v;
}

bool hitsSideAbsorber(vec2 xPx){
  float w = float(uSimRes.x) - 1.0;
  float base = max(uAbsorbPx + uParticleKillMarginPx, 0.0);
  float leftLimit = (base > 0.0) ? base / 1.20 : 0.0;
  float rightLimit = (base > 0.0) ? w - base : w;
  return xPx.x <= leftLimit || xPx.x >= rightLimit || xPx.x < 0.0 || xPx.x > w;
}

vec2 reflectFromTopBottomMirrors(vec2 prev, vec2 xn){
  vec2 innerMin, innerMax;
  domainBounds(innerMin, innerMax);
  if (xn.y < innerMin.y) xn.y = 2.0 * innerMin.y - xn.y;
  if (xn.y > innerMax.y) xn.y = 2.0 * innerMax.y - xn.y;
  xn = clamp(xn, innerMin, innerMax);
  return xn;
}

void splitterData(out vec2 centerPx, out float halfLength, out float halfWidth){
  vec2 innerMin, innerMax;
  cavityBounds(innerMin, innerMax);
  centerPx = vec2(
    mix(innerMin.x, innerMax.x, uSplitterXFrac),
    0.5 * (innerMin.y + innerMax.y)
  );
  halfLength = max(0.5 * uSplitterLengthPx, 1.0);
  halfWidth = max(0.5 * uSplitterWidthPx, 0.5);
}

void detectorData(out vec2 centerPx, out float halfLength){
  vec2 innerMin, innerMax;
  cavityBounds(innerMin, innerMax);
  centerPx = vec2(
    mix(innerMin.x, innerMax.x, uDetectionXFrac),
    0.5 * (innerMin.y + innerMax.y)
  );
  halfLength = max(0.5 * uDetectorLengthPx, 1.0);
}

void guideMirrorData(float armSign, out vec2 anchor, out vec2 tangent, out vec2 normal, out float halfLength, out float halfWidth){
  vec2 innerMin, innerMax;
  cavityBounds(innerMin, innerMax);

  vec2 splitterCenter = vec2(
    mix(innerMin.x, innerMax.x, uSplitterXFrac),
    0.5 * (innerMin.y + innerMax.y)
  );

  float splitterX = splitterCenter.x;
  float detectorX = mix(innerMin.x, innerMax.x, uDetectorXFrac);
  float rawHitX = mix(innerMin.x, innerMax.x, uGuideMirrorXFrac);
  float hitMin = splitterX + 16.0;
  float hitMax = max(hitMin + 1.0, detectorX - 16.0);
  float hitX = clamp(rawHitX, hitMin, hitMax);

  float rawArmDy = max(hitX - splitterX + uGuideMirrorYTrimPx, 4.0);
  float anchorY = clamp(
    splitterCenter.y + armSign * rawArmDy,
    innerMin.y + 8.0,
    innerMax.y - 8.0
  );
  anchor = vec2(hitX, anchorY);

  float dxOut = max(detectorX - hitX, 1.0);
  float incidentAngle = armSign * 0.25 * PI;
  float targetAngle = atan(splitterCenter.y - anchorY, dxOut);
  float mirrorAngle = 0.5 * (incidentAngle + targetAngle) + armSign * uGuideMirrorAngleTrim;
  tangent = vec2(cos(mirrorAngle), sin(mirrorAngle));
  normal = vec2(-tangent.y, tangent.x);
  halfLength = max(0.5 * uGuideMirrorLengthPx, 1.0);
  halfWidth = max(0.5 * uGuideMirrorWidthPx, 0.5);
}

bool reflectFromGuideMirror(float armSign, vec2 prev, inout vec2 next){
  vec2 anchor, tangent, normal;
  float halfLength, halfWidth;
  guideMirrorData(armSign, anchor, tangent, normal, halfLength, halfWidth);

  float d0 = dot(prev - anchor, normal);
  float d1 = dot(next - anchor, normal);
  float denom = d0 - d1;
  if(abs(denom) <= 1e-5 || d0 * d1 > 0.0) return false;

  float t = clamp(d0 / denom, 0.0, 1.0);
  vec2 hit = mix(prev, next, t);
  float along = dot(hit - anchor, tangent);
  if(abs(along) > halfLength + 4.0) return false;

  vec2 remainder = next - hit;
  remainder -= 2.0 * dot(remainder, normal) * normal;
  float side = (d0 < 0.0) ? -1.0 : 1.0;
  next = hit + remainder + side * normal * max(0.75, halfWidth + 0.25);
  return true;
}

vec2 reflectFromGuideMirrors(vec2 prev, vec2 next){
  if(uGuideMirrorsActive != 1) return next;
  vec2 corrected = next;
  if(reflectFromGuideMirror(1.0, prev, corrected)) return corrected;
  reflectFromGuideMirror(-1.0, prev, corrected);
  return corrected;
}

void main() {
  vec2 x = aState.xy;
  float mode = aState.z;
  float transmitted = aState.w;

  if(mode < 0.5){
    vState = aState;
    gl_Position = vec4(-2.0);
    return;
  }

  if(mode > 1.5){
    if(uDetectorActive == 0){
      mode = 1.0;
    } else {
      vState = aState;
      gl_Position = vec4(-2.0);
      return;
    }
  }

  if(hitsSideAbsorber(x)){
    vState = vec4(-10.0, -10.0, 0.0, transmitted);
    gl_Position = vec4(-2.0);
    return;
  }

  vec2 v1 = guidingVelocity(x);
  vec2 xm = clamp(x + 0.5*uDT*v1, vec2(0.0), vec2(uSimRes) - vec2(1.0));
  xm = reflectFromGuideMirrors(x, xm);
  xm = reflectFromTopBottomMirrors(x, xm);

  if(hitsSideAbsorber(xm)){
    vState = vec4(-10.0, -10.0, 0.0, transmitted);
    gl_Position = vec4(-2.0);
    return;
  }

  vec2 v2 = guidingVelocity(xm);
  vec2 xn = x + uDT*v2;
  xn = reflectFromGuideMirrors(x, xn);
  xn = reflectFromTopBottomMirrors(x, xn);

  bool crossedDetector = false;
  if(uDetectorActive == 1){
    vec2 detectorCenter;
    float detectorHalfLength;
    detectorData(detectorCenter, detectorHalfLength);

    float dx = xn.x - x.x;
    if (abs(dx) > 1e-5) {
      float tHit = (detectorCenter.x - x.x) / dx;
      if (tHit >= 0.0 && tHit <= 1.0) {
        float yHit = mix(x.y, xn.y, tHit);
        if (abs(yHit - detectorCenter.y) <= detectorHalfLength) {
          xn = vec2(detectorCenter.x, yHit);
          crossedDetector = true;
        }
      }
    }
  }

  if(!crossedDetector && hitsSideAbsorber(xn)){
    vState = vec4(-10.0, -10.0, 0.0, transmitted);
    gl_Position = vec4(-2.0);
    return;
  }

  vec2 centerPx;
  float halfLength, halfWidth;
  splitterData(centerPx, halfLength, halfWidth);

  bool crossedMidline = x.y > centerPx.y && xn.y <= centerPx.y;
  bool withinSplitterSpan = abs(xn.x - centerPx.x) <= halfLength + 4.0;

  if(transmitted < 0.5 && crossedMidline && withinSplitterSpan){
    transmitted = 1.0;
  }

  float nextMode = crossedDetector ? 2.0 : mode;
  vState = vec4(xn, nextMode, transmitted);
  gl_Position = vec4(-2.0);
}
