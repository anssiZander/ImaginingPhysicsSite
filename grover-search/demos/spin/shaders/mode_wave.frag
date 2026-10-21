#version 300 es
precision highp float;
uniform vec4 uCoefficients[25];
uniform int uSide;
uniform float uGridSize;
out vec4 fragColor;
void main() {
  vec2 xy=(gl_FragCoord.xy-.5)/(uGridSize-1.0);
  if(min(xy.x,xy.y)<=0.0||max(xy.x,xy.y)>=1.0){fragColor=vec4(0);return;}
  const float PI=3.141592653589793;
  float sx[5],sy[5];
  for(int n=0;n<5;n++){sx[n]=sin(PI*xy.x*float(n+1));sy[n]=sin(PI*xy.y*float(n+1));}
  vec4 psi=vec4(0);
  for(int n=0;n<5;n++)for(int m=0;m<5;m++){
    if(n<uSide&&m<uSide)psi+=uCoefficients[uSide*n+m]*(2.0*sx[n]*sy[m]);
  }
  fragColor=psi;
}
