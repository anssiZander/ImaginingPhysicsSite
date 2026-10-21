#version 300 es
precision highp float;
precision highp sampler2D;
layout(location=0) in vec2 aUV;
uniform sampler2D uWave;
uniform mat4 uViewProj;
uniform float uHeightScale;
uniform float uHeightRhoMax;
out vec2 vUV;
out vec2 vPsi;
out float vRho;
out float vHeight;
out vec3 vWorldPos;
void main() {
  vUV = aUV;
  vPsi = texture(uWave, aUV).rg;
  vRho = dot(vPsi,vPsi);
  vHeight = min(vRho/max(uHeightRhoMax,1e-8),1.55)*uHeightScale;
  vec2 xy = aUV - vec2(0.5);
  vWorldPos = vec3(xy.x, vHeight, xy.y);
  gl_Position = uViewProj * vec4(vWorldPos,1.0);
}
