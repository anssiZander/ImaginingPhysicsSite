#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uViewport;
uniform float uPixelsPerUnit;
uniform float uPole;
uniform vec3 uBackground;
uniform vec3 uGridMinor;
uniform vec3 uGridMajor;
uniform vec3 uEquator;
uniform vec2 uGridStep;
uniform vec2 uLatitudeGridStep;
uniform vec3 uGridWidth;
uniform sampler2D uAreaMask;
uniform vec3 uAreaPositive;
uniform vec3 uAreaNegative;
uniform float uAreaOpacity;
out vec4 outColor;
const float PI = 3.141592653589793;

float line(float coordinate, float spacing, float width) {
  float wave = sin(PI * coordinate / spacing);
  float d = abs(wave) / max(fwidth(wave), 0.00001);
  return 1.0 - smoothstep(max(0.0, width - 0.5), width + 0.5, d);
}

void main() {
  // One scale for both axes preserves local angles on any canvas aspect ratio.
  vec2 p = (vUv - 0.5) * uViewport / uPixelsPerUnit;
  float r = length(p);
  float latitude = uPole * (PI * 0.5 - 2.0 * atan(r));
  float longitude = r > 0.0000001 ? atan(p.x, -uPole * p.y) : 0.0;
  vec2 uv = vec2(longitude / (2.0 * PI) + 0.5, latitude / PI + 0.5);
  float minor = max(line(longitude, uGridStep.x, uGridWidth.x), line(latitude, uLatitudeGridStep.x, uGridWidth.x));
  float major = max(line(longitude, uGridStep.y, uGridWidth.y), line(latitude, uLatitudeGridStep.y, uGridWidth.y));
  float equator = 1.0 - smoothstep(uGridWidth.z - 0.5, uGridWidth.z + 0.5, abs(latitude) / max(fwidth(latitude), 0.00001));
  vec3 color = uBackground * (1.0 + 0.10 * (1.0 - length(vUv - 0.5)));
  vec2 area = texture(uAreaMask, uv).rg;
  color = mix(color, uAreaPositive, area.r * uAreaOpacity);
  color = mix(color, uAreaNegative, area.g * uAreaOpacity);
  color = mix(color, uGridMinor, minor);
  color = mix(color, uGridMajor, major);
  color = mix(color, uEquator, equator);
  outColor = vec4(color, 1.0);
}
