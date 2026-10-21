#version 300 es
precision highp float;
layout(location=0) in vec4 aState;
uniform float uPointSize;
uniform int uNumParticles;
uniform float uTrailWidth;
out float vAlive;
out float vParticleId;
void main(){
  vAlive=aState.z;
  vParticleId=float(gl_VertexID)/float(max(uNumParticles,1));
  gl_Position=vec4(aState.xy*2.0-1.0,0.0,1.0);
  gl_PointSize=(uTrailWidth>0.0)?uTrailWidth:uPointSize;
}
