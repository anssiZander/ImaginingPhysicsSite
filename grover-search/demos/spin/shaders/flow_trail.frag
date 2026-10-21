#version 300 es
precision highp float;
in vec2 vLocal;
flat in float vLength;
uniform float uWidth;
uniform float uStampGain;
out vec4 fragColor;
void main() {
  float d=length(vec2(max(abs(vLocal.x)-.5*vLength,0.0),vLocal.y));
  float r=d/uWidth;
  // The soft circular stamp from DoubleSlit2.0, swept along each actual
  // integration segment so fast particles leave connected trails as well.
  float blur=exp(-.25*r*r/.28);
  float edge=1.0-smoothstep(.84,1.0,r);
  float residence=2.0*uWidth/(vLength+2.0*uWidth);
  fragColor=vec4(uStampGain*blur*edge*residence,0,0,0);
}
