#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uBase;
uniform sampler2D uPrevK;
uniform float uDT;
uniform float uScale;
uniform float uHbar;
uniform float uMass;

out vec4 fragColor;

vec2 temporaryPsi(ivec2 p, ivec2 size) {
  if (p.x <= 0 || p.y <= 0 || p.x >= size.x - 1 || p.y >= size.y - 1) return vec2(0.0);
  vec2 base = texelFetch(uBase, p, 0).rg;
  vec2 k = texelFetch(uPrevK, p, 0).rg;
  return base + (uScale * uDT) * k;
}

void main() {
  ivec2 size = textureSize(uBase, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (p.x <= 0 || p.y <= 0 || p.x >= size.x - 1 || p.y >= size.y - 1) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 c = temporaryPsi(p, size);
  vec2 l = temporaryPsi(p + ivec2(-1, 0), size);
  vec2 r = temporaryPsi(p + ivec2( 1, 0), size);
  vec2 b = temporaryPsi(p + ivec2(0, -1), size);
  vec2 t = temporaryPsi(p + ivec2(0,  1), size);

  float dx = 1.0 / float(size.x - 1);
  float invDx2 = 1.0 / (dx * dx);
  vec2 lap = (l + r + b + t - 4.0 * c) * invDx2;
  vec2 hPsi = -(uHbar * uHbar / (2.0 * max(uMass, 1e-8))) * lap;

  // d psi / dt = -i H psi / hbar.
  vec2 deriv = vec2(hPsi.y, -hPsi.x) / max(uHbar, 1e-8);
  fragColor = vec4(deriv, 0.0, 1.0);
}
