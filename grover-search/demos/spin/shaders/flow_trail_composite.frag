#version 300 es
precision highp float;
uniform sampler2D uTrail;
uniform float uScale;
in vec2 vUV;
out vec4 fragColor;
void main() {
  float density=max(0.0,texture(uTrail,vUV).r*uScale);
  float light=1.0-exp(-.4*density);
  fragColor=vec4(vec3(1.0,.92,.08)*light,1.0);
}
