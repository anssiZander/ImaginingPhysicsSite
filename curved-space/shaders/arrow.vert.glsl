#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewProjection;
uniform mat3 uBasis;
uniform vec3 uOrigin;
uniform float uScale;
uniform vec3 uShape;
uniform vec4 uAxial; // source shaft/cone lengths, target shaft/cone lengths
out vec3 vPosition;
out vec3 vNormal;
void main() {
  float shaftScale = uAxial.z / uAxial.x;
  float coneScale = uAxial.w / uAxial.y;
  float x = aPosition.x <= uAxial.x
    ? aPosition.x * shaftScale
    : uAxial.z + (aPosition.x - uAxial.x) * coneScale;
  // Cone-side vertices at the shared neck still need the cone's normal scale.
  float axialNormalScale = aNormal.x > 0.0 ? coneScale : shaftScale;
  vPosition = uOrigin + uBasis * vec3(x, aPosition.yz * uShape.yz) * uScale;
  vNormal = uBasis * (aNormal / vec3(axialNormalScale, uShape.yz));
  gl_Position = uViewProjection * vec4(vPosition, 1.0);
}
