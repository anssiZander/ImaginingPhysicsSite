#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPosition;
uniform vec3 uEye;
uniform vec3 uLight;
uniform vec3 uSurface;
uniform vec3 uGridMinor;
uniform vec3 uGridMajor;
uniform vec3 uEquator;
uniform vec3 uRim;
uniform vec2 uGridStep;
uniform vec3 uGridWidth;
uniform vec4 uLighting;
uniform sampler2D uAreaMask;
uniform vec3 uAreaPositive;
uniform vec3 uAreaNegative;
uniform float uAreaOpacity;
uniform float uCurvatureOpacity;
uniform bool uTorus;
uniform vec2 uRadii;
uniform float uRadius;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
out vec4 outColor;
const float PI = 3.141592653589793;

float gridLine(float angle, float stepSize, float width) {
  float coordinate = angle / stepSize;
  float footprint = fwidth(coordinate);
  float distancePx = abs(fract(coordinate + 0.5) - 0.5) / max(footprint, 0.00001);
  // Fade subpixel cells at a walking camera's horizon instead of producing moire.
  return (1.0 - smoothstep(max(0.0, width - 0.5), width + 0.5, distancePx))
       * (1.0 - smoothstep(0.2, 0.75, footprint));
}

void main() {
  vec3 n = normalize(vNormal);
  float latitude = uTorus ? atan(vPosition.y, length(vPosition.xz) - uRadii.x * uRadius) : asin(clamp(n.y, -1.0, 1.0));
  float longitude = atan(vPosition.x, vPosition.z);
  float minor = max(gridLine(latitude, uGridStep.x, uGridWidth.x), gridLine(longitude, uGridStep.x, uGridWidth.x));
  float major = max(gridLine(latitude, uGridStep.y, uGridWidth.y), gridLine(longitude, uGridStep.y, uGridWidth.y));
  float equator = 1.0 - smoothstep(uGridWidth.z - 0.5, uGridWidth.z + 0.5, abs(latitude) / max(fwidth(latitude), 0.00001));
  vec3 viewDirection = normalize(uEye - vPosition);
  float facing = max(dot(n, viewDirection), 0.0);
  float diffuse = max(dot(n, normalize(uLight)), 0.0);
  float illumination = uLighting.x + uLighting.y * diffuse;
  vec3 color = uSurface * illumination;
  // Gaussian-curvature sign for geodesic deviation; zero in transport mode.
  float curvatureSign = uTorus ? cos(latitude) : 1.0;
  vec3 curvatureColor = curvatureSign < 0.0 ? uAreaNegative : uAreaPositive;
  color = mix(color, curvatureColor * (0.45 + 0.55 * illumination), uCurvatureOpacity * smoothstep(0.0, 0.35, abs(curvatureSign)));
  vec2 area = texture(uAreaMask, vec2(longitude / (2.0 * PI) + 0.5, latitude / (uTorus ? 2.0 * PI : PI) + 0.5)).rg;
  color = mix(color, uAreaPositive * (0.65 + 0.35 * illumination), area.r * uAreaOpacity);
  color = mix(color, uAreaNegative * (0.65 + 0.35 * illumination), area.g * uAreaOpacity);
  color = mix(color, uGridMinor * (0.6 + 0.4 * illumination), minor);
  color = mix(color, uGridMajor * (0.6 + 0.4 * illumination), major);
  color = mix(color, uEquator, equator * 0.75);
  color += uRim * pow(1.0 - facing, uLighting.w) * uLighting.z;
  if (uFogRange.y > 0.0) color = mix(color, uFogColor, smoothstep(uFogRange.x, uFogRange.y, distance(uEye, vPosition)));
  outColor = vec4(color, 1.0);
}
