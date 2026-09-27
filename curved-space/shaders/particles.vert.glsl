#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec4 aCenterRadius;
layout(location = 2) in vec3 aColor;
uniform mat4 uViewProjection;
uniform vec3 uStretch;
uniform mat3 uPrincipalBasis;
uniform float uWorldScale;
out vec3 vPosition;
out vec3 vNormal;
out vec3 vColor;
void main() {
  // Deform the distribution of centers; each individual test mass stays spherical.
  vPosition = (uPrincipalBasis * (aCenterRadius.xyz * uStretch) + aPosition * aCenterRadius.w) * uWorldScale;
  vNormal = aPosition;
  vColor = aColor;
  gl_Position = uViewProjection * vec4(vPosition, 1.0);
}
