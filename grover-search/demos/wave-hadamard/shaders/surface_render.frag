#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uWave;
uniform float uVisGain;
uniform float uVisGamma;
uniform int uShowPhase;
uniform sampler2D uTrailDensity;
uniform int uShowTrail;
uniform float uTrailGain;
uniform float uTrailGamma;
uniform int uTarget;
uniform float uGateFlash;
uniform int uGateQuadrant;
in vec2 vUV;
in vec2 vPsi;
in float vRho;
in float vHeight;
in vec3 vWorldPos;
out vec4 fragColor;

vec3 hsv2rgb(vec3 c){
  vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.);
  return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);
}
vec3 phasePalette(float phase,float intensity){
  float hue=fract(phase/6.28318530718+1.);
  float structure=smoothstep(.015,.20,intensity);
  float saturation=mix(.28,.94,structure);
  float value=.075+.925*intensity;
  return hsv2rgb(vec3(hue,saturation,value));
}
vec3 densityPalette(float t){vec3 a=vec3(.22,.32,.28),b=vec3(.40,.45,.35),d=vec3(.15,.55,.75);return a+b*cos(6.283185*(t+d));}
float qmask(vec2 uv,int q){float sx=smoothstep(.49,.51,uv.x),sy=smoothstep(.49,.51,uv.y);float qx=(q==2||q==3)?sx:1.-sx;float qy=(q==1||q==3)?sy:1.-sy;return qx*qy;}
float qborder(vec2 uv,int q){vec2 c=vec2((q==2||q==3)?.75:.25,(q==1||q==3)?.75:.25);vec2 d=abs(uv-c);float e=min(abs(d.x-.245),abs(d.y-.245));return step(d.x,.25)*step(d.y,.25)*(1.-smoothstep(.002,.009,e));}
void main(){
  float I=pow(clamp(1.-exp(-uVisGain*vRho),0.,1.),uVisGamma);
  vec3 base;
  if(uShowPhase==1){
    // Preserve and display the full phase, including global phase evolution.
    float ph=atan(vPsi.y,vPsi.x);
    base=phasePalette(ph,I);
  }else base=densityPalette(I)*I;
  vec3 dx=dFdx(vWorldPos),dy=dFdy(vWorldPos);vec3 n=normalize(cross(dx,dy));if(n.y<0.)n=-n;
  vec3 ld=normalize(vec3(-.48,.86,.30)),fd=normalize(vec3(.58,.35,-.72));
  vec3 col=base*(.40+.70*max(dot(n,ld),0.)+.16*max(dot(n,fd),0.));
  col+=vec3(.22,.38,.60)*pow(1.-clamp(n.y,0.,1.),1.55)*.18;
  float wall=min(min(vUV.x,vUV.y),min(1.-vUV.x,1.-vUV.y));float rim=1.-smoothstep(.002,.009,wall);
  col=mix(col,vec3(.35,.94,1.),.78*rim);col+=vec3(.04,.45,.92)*exp(-wall*84.)*.24;
  float cross=max(1.-smoothstep(.0015,.005,abs(vUV.x-.5)),1.-smoothstep(.0015,.005,abs(vUV.y-.5)));
  col=mix(col,vec3(.18,.55,.72),.28*cross);col+=vec3(1.,.58,.13)*qborder(vUV,uTarget)*.36;col+=vec3(1.,.28,.72)*qmask(vUV,uGateQuadrant)*uGateFlash*.14;
  float contour=1.-smoothstep(.032,.072,abs(fract(vHeight*18.)-.5));col=mix(col,col+vec3(.13,.20,.24),contour*.22);
  if(uShowTrail==1){float d=max(texture(uTrailDensity,vUV).r,0.);float tr=pow(clamp(1.-exp(-uTrailGain*d),0.,1.),uTrailGamma);col+=vec3(1.,.82,.22)*tr*.58;}
  fragColor=vec4(col,1.);
}
