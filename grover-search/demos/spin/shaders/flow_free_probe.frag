#version 300 es
precision highp float;
precision highp sampler2D;
uniform float uGridSize;
uniform float uProgress;
layout(location=0) out vec4 wave;
layout(location=1) out vec4 current;
// FLOW_SAMPLE
void main() {
  vec2 uv=(gl_FragCoord.xy-.5)/(uGridSize-1.0),conv,spin,correction;
  currentsAt(uv,uProgress,wave,conv,spin,correction);
  current=vec4(conv+spin+correction,spin);
}
