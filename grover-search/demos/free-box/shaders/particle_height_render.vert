#version 300 es
precision highp float;
precision highp sampler2D;
layout(location=0) in vec4 aState;
uniform sampler2D uWave;
uniform mat4 uViewProj;
uniform float uHeightScale;
uniform float uHeightRhoMax;
uniform float uPointSize;
out float vAlive;
void main(){
  vAlive=aState.z;vec2 uv=clamp(aState.xy,vec2(0.),vec2(1.));vec2 psi=texture(uWave,uv).rg;float rho=dot(psi,psi);
  float h=min(rho/max(uHeightRhoMax,1e-8),1.55)*uHeightScale+.006;vec2 xy=uv-vec2(.5);
  gl_Position=uViewProj*vec4(xy.x,h,xy.y,1.);gl_PointSize=uPointSize;
}
