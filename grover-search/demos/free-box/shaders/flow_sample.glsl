// Shared by particle integration and the current arrows. Manual bilinear
// sampling also works on WebGL2 devices without float-linear filtering.
uniform sampler2D uWaveParts;
uniform sampler2D uCurrentParts;
uniform int uFree;
uniform int uSide;
uniform vec2 uFreeCoefficients[25];
uniform float uFreeSpan;
vec4 flowSample(sampler2D tex,vec2 uv) {
  ivec2 last=textureSize(tex,0)-1;
  vec2 p=clamp(uv,0.0,1.0)*vec2(last);ivec2 a=ivec2(floor(p)),b=min(a+1,last);
  vec2 t=fract(p);
  return mix(mix(texelFetch(tex,a,0),texelFetch(tex,ivec2(b.x,a.y),0),t.x),
    mix(texelFetch(tex,ivec2(a.x,b.y),0),texelFetch(tex,b,0),t.x),t.y);
}
vec2 flowPsi(vec4 parts,float angle) {
  float c=cos(angle),s=sin(angle);
  return parts.xy+vec2(c*parts.z+s*parts.w,c*parts.w-s*parts.z);
}
vec2 flowCurrent(vec4 parts,float angle,float rate) {
  return rate*(-sin(angle)*parts.xy+cos(angle)*parts.zw);
}
// Exact sine sum and its spatial derivatives at every integrator stage.
// Returns T*j, rho, phase. uFreeSpan=E1*T_gate/hbar is positive for ALL mixers.
vec4 freeState(vec2 uv,float progress,out vec2 psi) {
  const float PI=3.141592653589793;
  float sx[5],sy[5],dx[5],dy[5],co[5],si[5];
  for(int k=0;k<uSide;k++) {
    float n=float(k+1);
    sx[k]=sin(PI*uv.x*n);sy[k]=sin(PI*uv.y*n);
    dx[k]=PI*n*cos(PI*uv.x*n);dy[k]=PI*n*cos(PI*uv.y*n);
    co[k]=cos(uFreeSpan*progress*n*n);si[k]=sin(uFreeSpan*progress*n*n);
  }
  psi=vec2(0);vec2 gx=vec2(0),gy=vec2(0);
  for(int x=0;x<uSide;x++)for(int y=0;y<uSide;y++) {
    float c=co[x]*co[y]-si[x]*si[y],s=si[x]*co[y]+co[x]*si[y];
    vec2 a=uFreeCoefficients[uSide*x+y],b=vec2(c*a.x+s*a.y,c*a.y-s*a.x);
    psi+=2.0*sx[x]*sy[y]*b;gx+=2.0*dx[x]*sy[y]*b;gy+=2.0*sx[x]*dy[y]*b;
  }
  vec2 current=(2.0*uFreeSpan/(PI*PI))*vec2(psi.x*gx.y-psi.y*gx.x,psi.x*gy.y-psi.y*gy.x);
  float rho=dot(psi,psi);
  return vec4(current,rho,rho>1e-20?atan(psi.y,psi.x):0.0);
}
vec4 flowState(vec2 uv,float progress) {
  vec2 psi;
  if(uFree==1) return freeState(uv,progress,psi);
  float angle=3.141592653589793*progress;
  psi=flowPsi(flowSample(uWaveParts,uv),angle);
  float rho=dot(psi,psi);
  return vec4(flowCurrent(flowSample(uCurrentParts,uv),angle,3.141592653589793),rho,
    rho>1e-20?atan(psi.y,psi.x):0.0);
}
