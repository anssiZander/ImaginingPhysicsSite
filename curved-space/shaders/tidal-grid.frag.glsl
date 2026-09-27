#version 300 es
precision highp float;
uniform vec2 uViewport;
uniform float uPixelsPerUnit;
uniform float uRadius;
uniform float uInitialRadius;
uniform vec2 uSpacing;
uniform vec2 uWidths;
uniform vec2 uOpacity;
uniform vec3 uColor;
uniform vec3 uBackgroundCenter;
uniform vec3 uBackgroundEdge;
uniform float uEdgeOpacity;
out vec4 outColor;

float grid(vec2 position, float spacing, float width) {
  vec2 coordinate = position / spacing;
  // Derivatives retain constant line width as angular spacing contracts.
  vec2 distancePx = abs(fract(coordinate + 0.5) - 0.5) / max(fwidth(coordinate), vec2(0.00001));
  float nearest = min(distancePx.x, distancePx.y);
  return 1.0 - smoothstep(max(0.0, width * 0.5 - 0.5), width * 0.5 + 0.5, nearest);
}

void main() {
  vec2 position = (gl_FragCoord.xy - 0.5 * uViewport) / uPixelsPerUnit;
  // Meridional slice of spherical coordinates. The mass lies far below the
  // viewport at (0, -r(t)). Fixed-radius arcs rise as the observer falls;
  // constant-angle rays converge in proportion to r(t)/r0, like the blue axes.
  vec2 fromMass = vec2(position.x, uRadius + position.y);
  vec2 spherical = vec2(uInitialRadius * atan(fromMass.x, fromMass.y), length(fromMass) - uInitialRadius);
  float minor = grid(spherical, uSpacing.x, uWidths.x) * uOpacity.x;
  float major = grid(spherical, uSpacing.y, uWidths.y) * uOpacity.y;
  vec2 edge = abs(gl_FragCoord.xy / uViewport * 2.0 - 1.0);
  float fade = mix(1.0, uEdgeOpacity, smoothstep(0.45, 1.0, max(edge.x, edge.y)));
  vec3 background = mix(uBackgroundCenter, uBackgroundEdge, smoothstep(0.0, 1.0, length(edge)));
  outColor = vec4(mix(background, uColor, max(minor, major) * fade), 1.0);
}
