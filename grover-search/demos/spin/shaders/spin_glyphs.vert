#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uWave;
uniform int uSpinGrid;
out vec2 vLocal;
flat out vec3 vSpin;
flat out float vOpacity;
void main(){
  vec2 center=(vec2(gl_InstanceID%uSpinGrid,gl_InstanceID/uSpinGrid)+.5)/float(uSpinGrid);
  vec2 texel=1.0/vec2(textureSize(uWave,0));
  vec4 p=texture(uWave,mix(.5*texel,1.0-.5*texel,center));float rho=dot(p,p);
  vSpin=vec3(2.0*dot(p.xy,p.zw),2.0*(p.x*p.w-p.y*p.z),dot(p.xy,p.xy)-dot(p.zw,p.zw))/max(rho,1e-20);
  vOpacity=smoothstep(.015,.18,rho);
  const vec2 corners[6]=vec2[6](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(-1,1),vec2(1,-1),vec2(1,1));
  vLocal=corners[gl_VertexID];gl_Position=vec4(2.0*(center+vLocal*.43/float(uSpinGrid))-1.0,0,1);
}
