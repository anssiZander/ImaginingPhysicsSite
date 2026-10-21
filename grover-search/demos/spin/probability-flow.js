import { FREE_OMEGA, HBAR_OVER_M, sineCoefficients, gridModel, modelOfState } from './multiregion-core.js';

// Full reduced Pauli current: convective spinor current plus curl of spin density.
// At nonlocal gates, add grad(u), Delta u = -rho_dot - div(j_Pauli).

// Cosine coefficients of a†b, summed over both spin components. Products of
// sine modes 1..N contain cosine frequencies 0..2N, so this expansion is exact.
function crossDensity(a,b) {
  const {side,spatialCount}=modelOfState(a),modes=2*side+1;
  const re=new Float64Array(modes*modes),im=new Float64Array(modes*modes);
  for(let q=0;q<spatialCount;q++)for(let r=0;r<spatialCount;r++) {
    let real=0,imag=0;
    for(let s=0;s<2;s++){
      const i=4*q+2*s,j=4*r+2*s;
      real+=a[i]*b[j]+a[i+1]*b[j+1];imag+=a[i]*b[j+1]-a[i+1]*b[j];
    }
    const nx=[Math.abs(Math.floor(q/side)-Math.floor(r/side)),Math.floor(q/side)+Math.floor(r/side)+2],ny=[Math.abs((q%side)-(r%side)),(q%side)+(r%side)+2];
    for(let x=0;x<2;x++)for(let y=0;y<2;y++){
      const sign=x===y?1:-1,k=modes*nx[x]+ny[y];re[k]+=sign*real;im[k]+=sign*imag;
    }
  }return {re,im};
}
function kineticDerivative(a) {
  const {side,spatialCount}=modelOfState(a);
  const out=new Float64Array(a.length);
  for(let q=0;q<spatialCount;q++)for(let s=0;s<2;s++){
    const i=4*q+2*s,e=FREE_OMEGA*((1+Math.floor(q/side))**2+(1+(q%side))**2);
    out[i]=e*a[i+1];out[i+1]=-e*a[i];
  }return out;
}
export function gateFlow(start,kind,target,duration,initial=0) {
  const {side}=modelOfState(start),modes=2*side+1;
  if(['prepare','forward','inverse'].includes(kind))return {
    mode:'free',side,modes,coefficients:sineCoefficients(start),span:FREE_OMEGA*duration,
    spinAngle:(kind==='inverse'?-1:1)*Math.PI/2,duration,
  };
  if(kind!=='oracle'&&kind!=='reference')throw Error('Unknown phase gate: '+kind);
  const fixed=Float64Array.from(start),rotating=new Float64Array(start.length),q=kind==='oracle'?target:initial;
  rotating[2*q]=fixed[2*q];rotating[2*q+1]=fixed[2*q+1];fixed[2*q]=0;fixed[2*q+1]=0;
  const f=sineCoefficients(fixed),g=sineCoefficients(rotating),cross=crossDensity(f,g);
  const dc=cross.re.map(v=>2*v),ds=cross.im.map(v=>2*v),df=kineticDerivative(f),dg=kineticDerivative(g);
  const ff=crossDensity(f,df),gg=crossDensity(g,dg),fg=crossDensity(f,dg),gf=crossDensity(g,df);
  const potential=new Float64Array(3*modes*modes),rate=Math.PI/duration;
  // div(j_P) = -rho_dot_kinetic; the magnetization current has zero divergence.
  // With Delta cos(n*pi*x)cos(m*pi*y) = -lambda*cos*cos, the correction
  // coefficients are (rho_dot_actual - rho_dot_kinetic)/lambda.
  // Pack their constant, cos(pi*p), and sin(pi*p) terms per spatial frequency.
  for(let n=0;n<modes;n++)for(let m=0;m<modes;m++){
    const k=modes*n+m,lambda=Math.PI**2*(n*n+m*m);if(!lambda)continue;
    const k0=2*(ff.re[k]+gg.re[k]),kc=2*(fg.re[k]+gf.re[k]),ks=2*(fg.im[k]-gf.im[k]);
    potential[3*k]=-k0/lambda;
    potential[3*k+1]=(rate*ds[k]-kc)/lambda;
    potential[3*k+2]=(-rate*dc[k]-ks)/lambda;
  }
  dc[0]=0;ds[0]=0;
  return {mode:'phase',side,modes,f,g,dc,ds,potential,duration};
}
export function spinorFields(coefficients,x,y) {
  const {side}=modelOfState(coefficients);
  const psi=[0,0,0,0],gx=[0,0,0,0],gy=[0,0,0,0],dt=[0,0,0,0];
  for(let n=1;n<=side;n++)for(let m=1;m<=side;m++){
    const q=4*(side*(n-1)+m-1),sx=Math.sin(n*Math.PI*x),sy=Math.sin(m*Math.PI*y);
    const w=2*sx*sy,wx=2*n*Math.PI*Math.cos(n*Math.PI*x)*sy,wy=2*m*Math.PI*sx*Math.cos(m*Math.PI*y);
    for(let k=0;k<4;k++){psi[k]+=w*coefficients[q+k];gx[k]+=wx*coefficients[q+k];gy[k]+=wy*coefficients[q+k];}
    const energy=FREE_OMEGA*(n*n+m*m);
    for(let s=0;s<2;s++){dt[2*s]+=energy*w*coefficients[q+2*s+1];dt[2*s+1]-=energy*w*coefficients[q+2*s];}
  }return {psi,gx,gy,dt};
}
export function pauliCurrent(psi,gx,gy) {
  const conv=[0,0],spin=[0,0];
  for(let s=0;s<2;s++){
    const k=2*s,sign=s===0?1:-1;
    conv[0]+=HBAR_OVER_M*(psi[k]*gx[k+1]-psi[k+1]*gx[k]);
    conv[1]+=HBAR_OVER_M*(psi[k]*gy[k+1]-psi[k+1]*gy[k]);
    spin[0]+=HBAR_OVER_M*sign*(psi[k]*gy[k]+psi[k+1]*gy[k+1]);
    spin[1]-=HBAR_OVER_M*sign*(psi[k]*gx[k]+psi[k+1]*gx[k+1]);
  }
  return {convective:conv,spin};
}
export function flowAt(flow,x,y,progress) {
  const {side,modes}=flow,spatialCount=side*side;
  let coefficients,drho=0,correction=[0,0],correctionDivergence=0;
  if(flow.mode==='free'){
    coefficients=new Float64Array(flow.coefficients.length);
    const ca=Math.cos(flow.spinAngle*progress/2),sa=Math.sin(flow.spinAngle*progress/2);
    for(let q=0;q<spatialCount;q++){
      const a=flow.span*progress*((1+Math.floor(q/side))**2+(1+(q%side))**2),c=Math.cos(a),s=Math.sin(a),v=[];
      for(let k=0;k<4;k+=2){v[k]=c*flow.coefficients[4*q+k]+s*flow.coefficients[4*q+k+1];v[k+1]=c*flow.coefficients[4*q+k+1]-s*flow.coefficients[4*q+k];}
      for(let k=0;k<2;k++){coefficients[4*q+k]=ca*v[k]-sa*v[k+2];coefficients[4*q+k+2]=sa*v[k]+ca*v[k+2];}
    }
  }else{
    const a=Math.PI*progress,c=Math.cos(a),s=Math.sin(a),rate=Math.PI/flow.duration;
    coefficients=new Float64Array(flow.f.length);
    for(let k=0;k<coefficients.length;k+=2){coefficients[k]=flow.f[k]+c*flow.g[k]+s*flow.g[k+1];coefficients[k+1]=flow.f[k+1]+c*flow.g[k+1]-s*flow.g[k];}
    for(let n=0;n<modes;n++)for(let m=0;m<modes;m++){
      const k=modes*n+m,cx=Math.cos(n*Math.PI*x),cy=Math.cos(m*Math.PI*y);
      const chi=flow.potential[3*k]+c*flow.potential[3*k+1]+s*flow.potential[3*k+2];
      drho+=rate*(-s*flow.dc[k]+c*flow.ds[k])*cx*cy;
      correction[0]-=n*Math.PI*Math.sin(n*Math.PI*x)*cy*chi;
      correction[1]-=m*Math.PI*cx*Math.sin(m*Math.PI*y)*chi;
      correctionDivergence-=Math.PI**2*(n*n+m*m)*cx*cy*chi;
    }
  }
  const fields=spinorFields(coefficients,x,y),{psi,gx,gy,dt}=fields,{convective,spin}=pauliCurrent(psi,gx,gy);
  const kineticDrho=2*psi.reduce((s,v,k)=>s+v*dt[k],0);
  if(flow.mode==='free')drho=kineticDrho; // A uniform spin drive preserves rho pointwise.
  const rho=psi.reduce((s,v)=>s+v*v,0),polarization=rho>1e-24?
    [2*(psi[0]*psi[2]+psi[1]*psi[3])/rho,2*(psi[0]*psi[3]-psi[1]*psi[2])/rho,(psi[0]**2+psi[1]**2-psi[2]**2-psi[3]**2)/rho]:[0,0,0];
  return {rho,drho,psi,polarization,convective,spin,correction,
    current:convective.map((v,k)=>v+spin[k]+correction[k]),divergence:-kineticDrho+correctionDivergence};
}

// Inverse CDF of the initial 1D packet. Stratification and a deterministic
// shuffle avoid an artificial spatial lattice without resampling during gates.
function initialCdf(x,side,weights) {
  let sum = 0;
  for (let n = 1; n <= side; n++) for (let m = 1; m <= side; m++) {
    const integral = n === m ? x-Math.sin(2*n*Math.PI*x)/(2*n*Math.PI)
      : Math.sin((n-m)*Math.PI*x)/((n-m)*Math.PI)-Math.sin((n+m)*Math.PI*x)/((n+m)*Math.PI);
    sum += weights[n-1]*weights[m-1]*integral;
  }
  return sum;
}
export function sampleInitialParticles(count, seed = 73991, side = 4, initial = 0) {
  const {packetTransform:transform,stateCount}=gridModel(side);
  if(!Number.isInteger(initial)||initial<0||initial>=stateCount)throw new RangeError('Invalid initial state.');
  const region=initial>>1,xCell=Math.floor(region/side),yCell=region%side;
  let randomState = seed >>> 0;
  const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0)/4294967296; };
  const quantilesX = new Float32Array(count),quantilesY=xCell===yCell?quantilesX:new Float32Array(count);
  const axes=[[transform[xCell],quantilesX]],order=Uint32Array.from({length:count},(_,i)=>i);
  if(xCell!==yCell)axes.push([transform[yCell],quantilesY]);
  for (let i = 0; i < count; i++) {
    const u = (i+.15+.7*random())/count;
    for(const [weights,quantiles] of axes){
      let lo = 0, hi = 1;
      for (let k = 0; k < 34; k++) { const mid = .5*(lo+hi); if (initialCdf(mid,side,weights) < u) lo = mid; else hi = mid; }
      quantiles[i] = .5*(lo+hi);
    }
  }
  for (let i = count-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [order[i],order[j]] = [order[j],order[i]]; }
  const states = new Float32Array(4*count);
  for (let i = 0; i < count; i++) { states[4*i] = quantilesX[i]; states[4*i+1] = quantilesY[order[i]]; }
  return states;
}
