// The exact spinor and derivatives are shared by particles, arrows, and probes.
// Phase-gate correction fields are the only interpolated quantities.
uniform sampler2D uCorrectionA;
uniform sampler2D uCorrectionB;
uniform int uFree;
uniform int uSide;
uniform vec4 uFreeCoefficients[25];
uniform vec4 uFixed[25];
uniform vec4 uRotating[25];
uniform float uFreeSpan;
uniform float uSpinAngle;
uniform float uDuration;
uniform float uHbarOverM;
vec4 flowSample(sampler2D tex,vec2 uv) {
  ivec2 last=textureSize(tex,0)-1;
  vec2 p=clamp(uv,0.0,1.0)*vec2(last);ivec2 a=ivec2(floor(p)),b=min(a+1,last);
  vec2 t=fract(p);
  return mix(mix(texelFetch(tex,a,0),texelFetch(tex,ivec2(b.x,a.y),0),t.x),
    mix(texelFetch(tex,ivec2(a.x,b.y),0),texelFetch(tex,b,0),t.x),t.y);
}
vec4 complexPhase(vec4 a,float c,float s) {
  return vec4(c*a.x+s*a.y,c*a.y-s*a.x,c*a.z+s*a.w,c*a.w-s*a.z);
}
vec4 spinRotate(vec4 a,float c,float s) {return vec4(c*a.xy-s*a.zw,s*a.xy+c*a.zw);}
void spinorAt(vec2 uv,float progress,out vec4 psi,out vec4 gx,out vec4 gy) {
  const float PI=3.141592653589793;
  float sx[5],sy[5],dx[5],dy[5],co[5],si[5];
  for(int i=0;i<5;i++){
    float n=float(i+1);
    sx[i]=sin(PI*uv.x*n);sy[i]=sin(PI*uv.y*n);
    dx[i]=PI*n*cos(PI*uv.x*n);dy[i]=PI*n*cos(PI*uv.y*n);
    co[i]=cos(uFreeSpan*progress*n*n);si[i]=sin(uFreeSpan*progress*n*n);
  }
  float c=cos(PI*progress),s=sin(PI*progress);
  psi=vec4(0);gx=vec4(0);gy=vec4(0);
  for(int x=0;x<5;x++)for(int y=0;y<5;y++) {
    if(x>=uSide||y>=uSide)continue;
    int q=uSide*x+y;
    vec4 a;
    if(uFree==1)a=complexPhase(uFreeCoefficients[q],co[x]*co[y]-si[x]*si[y],si[x]*co[y]+co[x]*si[y]);
    else a=uFixed[q]+complexPhase(uRotating[q],c,s);
    psi+=2.0*sx[x]*sy[y]*a;gx+=2.0*dx[x]*sy[y]*a;gy+=2.0*sx[x]*dy[y]*a;
  }
  if(uFree==1) {
    float ca=cos(.5*uSpinAngle*progress),sa=sin(.5*uSpinAngle*progress);
    psi=spinRotate(psi,ca,sa);gx=spinRotate(gx,ca,sa);gy=spinRotate(gy,ca,sa);
  }
}
void currentsAt(vec2 uv,float p,out vec4 psi,out vec2 conv,out vec2 spin,out vec2 correction) {
  vec4 gx,gy;spinorAt(uv,p,psi,gx,gy);
  conv=uHbarOverM*vec2(
    psi.x*gx.y-psi.y*gx.x+psi.z*gx.w-psi.w*gx.z,
    psi.x*gy.y-psi.y*gy.x+psi.z*gy.w-psi.w*gy.z);
  // (hbar/2m) (d_y(|up|²-|down|²), -d_x(|up|²-|down|²)).
  // Differentiating spin density includes rho * curl(s) for nonuniform spin.
  spin=uHbarOverM*vec2(dot(psi.xy,gy.xy)-dot(psi.zw,gy.zw),
    -dot(psi.xy,gx.xy)+dot(psi.zw,gx.zw));
  correction=vec2(0);
  if(uFree==0) {
    vec4 a=flowSample(uCorrectionA,uv),b=flowSample(uCorrectionB,uv);
    correction=a.xy+cos(3.141592653589793*p)*a.zw+sin(3.141592653589793*p)*b.xy;
  }
}
vec4 flowState(vec2 uv,float p) {
  vec4 psi;vec2 conv,spin,correction;currentsAt(uv,p,psi,conv,spin,correction);
  float rho=dot(psi,psi);
  return vec4(uDuration*(conv+spin+correction),rho,rho>1e-20?(dot(psi.xy,psi.xy)-dot(psi.zw,psi.zw))/rho:0.0);
}
