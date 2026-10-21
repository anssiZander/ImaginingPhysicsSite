#version 300 es
precision highp float;

uniform vec2 uCoefficients[25];
uniform float uGridSize;
uniform int uSide;
out vec4 fragColor;

void main() {
  // Store samples at x,y = j/(grid-1), including the exact hard walls.
  vec2 xy = (gl_FragCoord.xy - .5) / (uGridSize - 1.0);
  if (min(xy.x, xy.y) <= 0.0 || max(xy.x, xy.y) >= 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  const float PI = 3.141592653589793;
  float sx[5], sy[5];
  for (int n = 0; n < uSide; n++) {
    sx[n] = sin(PI * xy.x * float(n + 1)); sy[n] = sin(PI * xy.y * float(n + 1));
  }
  vec2 psi = vec2(0.0);
  for (int n = 0; n < uSide; ++n) for (int m = 0; m < uSide; ++m) {
    psi += uCoefficients[uSide*n+m] * (2.0 * sx[n] * sy[m]);
  }
  fragColor = vec4(psi, dot(psi, psi), 1.0);
}
