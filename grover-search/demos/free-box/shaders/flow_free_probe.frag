#version 300 es
precision highp float;
precision highp sampler2D;
uniform float uGridSize;
uniform float uProgress;
uniform float uDuration;
layout(location=0) out vec4 wave;
layout(location=1) out vec4 current;
// FLOW_SAMPLE
void main() {
  vec2 psi,uv=(gl_FragCoord.xy-.5)/(uGridSize-1.0);
  vec4 field=freeState(uv,uProgress,psi);
  wave=vec4(psi,0,0);current=vec4(field.xy/uDuration,0,0);
}
