#version 300 es
precision highp float;
precision highp sampler2D;

// Exact logical phase gate in the four-mode computational subspace:
// U_q(theta) = I + (exp(-i theta) - 1) |q><q|.
// uWave is the wave at the start of the animated gate, uCoefficient is
// <q|psi>, and uBasis stores phi_00, phi_01, phi_10, phi_11 in RGBA.
uniform sampler2D uWave;
uniform sampler2D uBasis;
uniform vec2 uCoefficient;
uniform float uAngle;
uniform int uQuadrant;

out vec4 fragColor;

vec2 complexMul(vec2 a, vec2 b) {
  return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
}

void main() {
  ivec2 size = textureSize(uWave, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (p.x <= 0 || p.y <= 0 || p.x >= size.x - 1 || p.y >= size.y - 1) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 psi0 = texelFetch(uWave, p, 0).rg;
  vec4 modes = texelFetch(uBasis, p, 0);
  float phi = (uQuadrant == 0) ? modes.r :
              (uQuadrant == 1) ? modes.g :
              (uQuadrant == 2) ? modes.b : modes.a;

  vec2 factor = vec2(cos(uAngle) - 1.0, -sin(uAngle));
  vec2 delta = complexMul(factor, uCoefficient) * phi;
  fragColor = vec4(psi0 + delta, phi, 1.0);
}
