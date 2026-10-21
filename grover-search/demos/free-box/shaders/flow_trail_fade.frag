#version 300 es
precision highp float;
uniform sampler2D uTrail;
uniform float uFade;
in vec2 vUV;
out vec4 fragColor;
void main() {fragColor=texture(uTrail,vUV)*uFade;}
