#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uBase;
uniform sampler2D uK1;
uniform sampler2D uK2;
uniform sampler2D uK3;
uniform sampler2D uK4;
uniform float uDT;
out vec4 fragColor;

void main() {
  ivec2 size = textureSize(uBase, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (p.x <= 0 || p.y <= 0 || p.x >= size.x - 1 || p.y >= size.y - 1) {
    fragColor = vec4(0.0);
    return;
  }
  vec2 base = texelFetch(uBase, p, 0).rg;
  vec2 k1 = texelFetch(uK1, p, 0).rg;
  vec2 k2 = texelFetch(uK2, p, 0).rg;
  vec2 k3 = texelFetch(uK3, p, 0).rg;
  vec2 k4 = texelFetch(uK4, p, 0).rg;
  vec2 psi = base + (uDT / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
  fragColor = vec4(psi, 0.0, 1.0);
}
