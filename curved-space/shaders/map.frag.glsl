#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uBackground;
uniform vec3 uGridMinor;
uniform vec3 uGridMajor;
uniform vec3 uEquator;
uniform vec2 uGridStep;
uniform vec3 uGridWidth;
uniform sampler2D uAreaMask;
uniform vec3 uAreaPositive;
uniform vec3 uAreaNegative;
uniform float uAreaOpacity;
uniform bool uTorus;
out vec4 outColor;
const float PI = 3.141592653589793;

float line(float coordinate, float spacing, float width) {
  float wave = sin(PI * coordinate / spacing);
  float d = abs(wave) / max(fwidth(wave), 0.00001);
  return 1.0 - smoothstep(max(0.0, width - 0.5), width + 0.5, d);
}

void main() {
  vec2 coordinate = (vUv - 0.5) * vec2(2.0 * PI, uTorus ? 2.0 * PI : PI);
  float minor = max(line(coordinate.x, uGridStep.x, uGridWidth.x), line(coordinate.y, uGridStep.x, uGridWidth.x));
  float major = max(line(coordinate.x, uGridStep.y, uGridWidth.y), line(coordinate.y, uGridStep.y, uGridWidth.y));
  float equator = 1.0 - smoothstep(uGridWidth.z - 0.5, uGridWidth.z + 0.5, abs(coordinate.y) / fwidth(coordinate.y));
  vec3 color = uBackground * (1.0 + 0.10 * (1.0 - length(vUv - 0.5)));
  vec2 area = texture(uAreaMask, vUv).rg;
  color = mix(color, uAreaPositive, area.r * uAreaOpacity);
  color = mix(color, uAreaNegative, area.g * uAreaOpacity);
  color = mix(color, uGridMinor, minor);
  color = mix(color, uGridMajor, major);
  color = mix(color, uEquator, equator);
  outColor = vec4(color, 1.0);
}
