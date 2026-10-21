#version 300 es
precision highp float;
in vec2 vLocal;
flat in vec3 vSpin;
flat in float vOpacity;
out vec4 fragColor;
float segment(vec2 p,vec2 a,vec2 b){vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),1e-10),0.0,1.0));}
void main(){
  vec2 tip=.8*vSpin.xy;float len=length(tip);vec2 direction=tip/max(len,1e-6),normal=vec2(-direction.y,direction.x);
  float d=segment(vLocal,-.25*tip,tip);
  d=min(d,segment(vLocal,tip,tip-.23*direction+.16*normal));
  d=min(d,segment(vLocal,tip,tip-.23*direction-.16*normal));
  float aa=max(fwidth(vLocal.x),.025),arrow=(1.0-smoothstep(.035,.035+aa,d))*smoothstep(.08,.25,len);
  float r=.07+.12*abs(vSpin.z);
  float circle=abs(length(vLocal)-r)-.035;
  float crossMark=min(segment(vLocal,vec2(-r,-r),vec2(r,r)),
    segment(vLocal,vec2(-r,r),vec2(r,-r)))-.035;
  float marker=vSpin.z>=0.0?circle:crossMark;
  float center=(1.0-smoothstep(0.0,aa,marker))*smoothstep(.12,.5,abs(vSpin.z));
  vec3 color=mix(vec3(1.0,.35,.77),vec3(.22,.92,1.0),.5+.5*vSpin.z);
  fragColor=vec4(color,max(arrow,center)*vOpacity*.88);
}
