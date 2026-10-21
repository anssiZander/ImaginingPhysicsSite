#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uWave;
uniform float uScale;
out vec4 fragColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 z = texelFetch(uWave, p, 0).rg * uScale;
  fragColor = vec4(z, 0.0, 1.0);
}
