#version 300 es
precision highp float;
layout(location=0) in vec4 aBefore;
layout(location=1) in vec4 aAfter;
uniform float uWidth;
out vec2 vLocal;
flat out float vLength;
void main() {
  vec2 d=aAfter.xy-aBefore.xy;float len=length(d);
  vec2 dir=len>1e-9?d/len:vec2(1,0),normal=vec2(-dir.y,dir.x);
  const vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  vec2 local=corners[gl_VertexID]*vec2(.5*len+uWidth,uWidth);
  vec2 pos=.5*(aBefore.xy+aAfter.xy)+dir*local.x+normal*local.y;
  gl_Position=vec4(2.0*pos-1.0,0,1);vLocal=local;vLength=len;
}
