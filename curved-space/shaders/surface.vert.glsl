#version 300 es
precision highp float;
layout(location = 0) in vec2 aCoordinate;
uniform mat4 uViewProjection;
uniform float uRadius;
uniform bool uTorus;
uniform vec2 uRadii;
out vec3 vNormal;
out vec3 vPosition;
void main() {
  float u = aCoordinate.x, v = aCoordinate.y;
  vNormal = vec3(cos(v) * sin(u), sin(v), cos(v) * cos(u));
  vec3 center = vec3(uRadii.x * sin(u), 0.0, uRadii.x * cos(u));
  vPosition = (uTorus ? center + uRadii.y * vNormal : vNormal) * uRadius;
  gl_Position = uViewProjection * vec4(vPosition, 1.0);
}
