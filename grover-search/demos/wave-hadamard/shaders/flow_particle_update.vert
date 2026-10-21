#version 300 es
precision highp float;
precision highp sampler2D;
layout(location=0) in vec4 aState;
uniform sampler2D uWaveParts;
uniform sampler2D uCurrentParts;
uniform float uDirection;
uniform float uEnd;
uniform int uNewGate;
out vec4 nextState;
// FLOW_SAMPLE
bool inside(vec2 p) {return all(greaterThan(p,vec2(0.0)))&&all(lessThan(p,vec2(1.0)));}
vec3 tangent(vec3 z) {
  float omega=uDirection*3.141592653589793,angle=omega*z.z;
  vec2 psi=flowPsi(flowSample(uWaveParts,z.xy),angle);
  // Integrate dx/ds = T*j, dp/ds = rho, so dx/dp = T*j/rho.
  // This time reparameterization crosses low-density regions without dividing
  // by rho, capping speed, or changing the prescribed trajectories.
  return vec3(flowCurrent(flowSample(uCurrentParts,z.xy),angle,omega),dot(psi,psi));
}
void main() {
  vec3 z=vec3(aState.xy,uNewGate==1?0.0:aState.z);
  float failures=aState.w,h=.002;
  // Embedded Bogacki-Shampine 3(2), independently adaptive for each particle.
  // There is no velocity cap, respawn, attraction, or density resampling.
  for(int step=0;step<384;step++) {
    if(z.z>=uEnd-2e-8) {z.z=uEnd;break;}
    vec3 k1=tangent(z);
    // The auxiliary clock may need very large steps near a node. Bound actual
    // motion and gate time, not this arbitrary parameter's step size.
    h=min(h,min((uEnd-z.z+1e-5)/max(k1.z,1e-20),.006/max(length(k1.xy),1e-20)));
    vec3 b=z+.5*h*k1,k2=tangent(b),c=z+.75*h*k2,k3=tangent(c);
    vec3 high=z+h*(2.0*k1/9.0+k2/3.0+4.0*k3/9.0),k4=tangent(high);
    vec3 low=z+h*(7.0*k1/24.0+k2/4.0+k3/3.0+k4/8.0);
    float distance=length(high.xy-z.xy);
    bool valid=inside(b.xy)&&inside(c.xy)&&inside(high.xy)&&!any(isnan(high))&&!any(isinf(high));
    float ratio=max(max(length(high.xy-low.xy)/1.5e-6,abs(high.z-low.z)/2e-6),distance/.006);
    if(valid&&ratio<=1.0) {
      if(high.z>=uEnd) {
        // Cubic Hermite dense output hits the requested gate time while
        // retaining the curved numerical trajectory through this short step.
        float lo=0.0,hi=1.0;vec3 at=z;
        for(int k=0;k<22;k++) {
          float t=.5*(lo+hi),t2=t*t,t3=t2*t;
          at=(2.0*t3-3.0*t2+1.0)*z+(t3-2.0*t2+t)*h*k1+(-2.0*t3+3.0*t2)*high+(t3-t2)*h*k4;
          if(at.z<uEnd) lo=t;else hi=t;
        }
        z=vec3(at.xy,uEnd);break;
      }
      z=high;
      h*=clamp(.85*pow(max(ratio,1e-8),-1.0/3.0),.3,2.0);
    } else {
      h*=valid?clamp(.8*pow(max(ratio,1e-8),-1.0/3.0),.1,.5):.25;
      if(h<1e-10) {failures+=1.0;break;}
    }
  }
  nextState=vec4(z,failures);
  gl_Position=vec4(0.0);
}
