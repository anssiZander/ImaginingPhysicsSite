#version 300 es
precision highp float;
precision highp sampler2D;
uniform float uProgress;
uniform float uGain;
uniform int uArrowGrid;
uniform int uCurrentMode;
out vec2 vLocal;
flat out vec4 vShape;
flat out float vAlpha;
flat out float vStrength;
flat out float vPhase;
// FLOW_SAMPLE
void main() {
  int n=uArrowGrid;
  vec2 center=(vec2(float(gl_InstanceID%n),float(gl_InstanceID/n))+.5)/float(n);
  vec4 psi;vec2 conv,spin,correction;currentsAt(center,uProgress,psi,conv,spin,correction);
  vec2 current=uCurrentMode==2?spin:(conv+correction+(uCurrentMode==0?spin:vec2(0)));
  float magnitude=length(current),strength=1.0-exp(-uGain*magnitude);
  vec2 dir=magnitude>1e-12?current/magnitude:vec2(1,0),normal=vec2(-dir.y,dir.x);
  float cell=1.0/float(n),len=cell*.83*max(strength,.035);
  float radius=cell*(.018+.024*strength),head=min(len*.38,radius*5.6),width=radius*2.65;
  const vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  vec2 local=corners[gl_VertexID]*vec2(len*.5+cell*.012,width+cell*.012);
  gl_Position=vec4(2.0*(center+dir*local.x+normal*local.y)-1.0,0,1);
  vLocal=local;vShape=vec4(len,radius,head,width);
  vAlpha=smoothstep(.002,.045,strength);vStrength=strength;vPhase=uCurrentMode==2?3.7:0.0;
}
