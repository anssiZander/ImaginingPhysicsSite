#version 300 es
precision highp float;
uniform vec2 uFixed[25];
uniform vec2 uRotating[25];
uniform vec2 uPotential[121];
uniform float uGridSize;
uniform int uSide;
uniform int uModes;
layout(location=0) out vec4 waveParts;
layout(location=1) out vec4 currentParts;
void main() {
  vec2 xy = (gl_FragCoord.xy-.5)/(uGridSize-1.0);
  float cx[11],cy[11],sx[11],sy[11];
  const float PI=3.141592653589793;
  for(int n=0;n<uModes;n++) {
    cx[n]=cos(float(n)*PI*xy.x);cy[n]=cos(float(n)*PI*xy.y);
    sx[n]=sin(float(n)*PI*xy.x);sy[n]=sin(float(n)*PI*xy.y);
  }
  vec2 f=vec2(0.0),g=vec2(0.0);
  for(int n=0;n<uSide;n++) for(int m=0;m<uSide;m++) {
    float w=2.0*sx[n+1]*sy[m+1];f+=w*uFixed[uSide*n+m];g+=w*uRotating[uSide*n+m];
  }
  vec2 jx=vec2(0.0),jy=vec2(0.0);
  for(int n=0;n<uModes;n++) for(int m=0;m<uModes;m++) {
    jx-=float(n)*PI*sx[n]*cy[m]*uPotential[uModes*n+m];
    jy-=float(m)*PI*cx[n]*sy[m]*uPotential[uModes*n+m];
  }
  if(xy.x<=0.0||xy.x>=1.0) {f=vec2(0.0);g=vec2(0.0);jx=vec2(0.0);}
  if(xy.y<=0.0||xy.y>=1.0) {f=vec2(0.0);g=vec2(0.0);jy=vec2(0.0);}
  waveParts=vec4(f,g);currentParts=vec4(jx.x,jy.x,jx.y,jy.y);
}
