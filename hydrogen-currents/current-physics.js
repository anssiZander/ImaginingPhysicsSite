// Hydrogen Coulomb eigenstates with uniform spin. Distances and currents use
// atomic units; the display chooses its size and playback scale separately.
export const ORBITALS = {
  '1s': {n:1,l:0,defaultM:0},
  '2p': {n:2,l:1,defaultM:0},
  '3d': {n:3,l:2,defaultM:0},
  '6p': {n:6,l:1,defaultM:1}
};

function factorial(n) {
  let value=1;
  for (let i=2;i<=n;i++) value*=i;
  return value;
}

export function laguerre(k,alpha,x) {
  if (k<0) return 0;
  let a=1,b=1+alpha-x;
  if (k===0) return a;
  for (let j=1;j<k;j++) [a,b]=[b,((2*j+1+alpha-x)*b-(j+alpha)*a)/(j+1)];
  return b;
}

export function legendre(l,m,mu) {
  if (l<m) return 0;
  let a=1;
  for (let j=1;j<=m;j++) a*=-(2*j-1)*Math.sqrt(Math.max(0,1-mu*mu));
  if (l===m) return a;
  let b=(2*m+1)*mu*a;
  for (let j=m+2;j<=l;j++) [a,b]=[b,((2*j-1)*mu*b-(j+m-1)*a)/(j-m)];
  return b;
}

export function createState(key,m=ORBITALS[key].defaultM) {
  const {n,l}=ORBITALS[key];
  if (!Number.isInteger(m) || Math.abs(m)>l) throw new Error('Invalid orbital phase winding');
  const ma=Math.abs(m);
  return {key,n,l,m,ma,k:n-l-1,alpha:2*l+1,
    radialNorm:Math.sqrt((2/n)**3*factorial(n-l-1)/(2*n*factorial(n+l))),
    angularNorm:Math.sqrt((2*l+1)/(4*Math.PI)*factorial(l-ma)/factorial(l+ma))};
}

export function radial(state,r) {
  const x=2*r/state.n;
  return state.radialNorm*Math.exp(-x/2)*x**state.l*laguerre(state.k,state.alpha,x);
}

export function densityAt(state,x,y,z) {
  const r=Math.hypot(x,y,z);
  const angular=state.angularNorm*legendre(state.l,state.ma,r?z/r:0);
  return (radial(state,r)*angular)**2;
}

export function currentAt(state,x,y,z) {
  const r=Math.hypot(x,y,z),s2=x*x+y*y;
  const mu=r?z/r:0,poly=legendre(state.l,state.ma,mu);
  const density=densityAt(state,x,y,z);
  if (!r || !s2 || !density) return {density,phaseOmega:NaN,spinOmega:NaN};
  const q=2*r/state.n;
  const radialLogDerivative=state.l/r-1/state.n
    -2/state.n*laguerre(state.k-1,state.alpha+1,q)/laguerre(state.k,state.alpha,q);
  const angularDerivative=state.l
    ? (state.l*mu*poly-(state.l+state.ma)*legendre(state.l-1,state.ma,mu))/(mu*mu-1)
    : 0;
  return {density,phaseOmega:state.m/s2,
    spinOmega:-radialLogDerivative/r+mu*angularDerivative/(r*r*poly)};
}

function cumulative(values,step) {
  const cdf=new Float64Array(values.length);
  for (let i=1;i<values.length;i++) cdf[i]=cdf[i-1]+(values[i-1]+values[i])*step/2;
  const norm=cdf[cdf.length-1];
  for (let i=0;i<cdf.length;i++) cdf[i]/=norm;
  return {cdf,norm};
}

function quantile(cdf,p) {
  let lo=0,hi=cdf.length-1;
  while (hi-lo>1) {
    const mid=(lo+hi)>>1;
    if (cdf[mid]<p) lo=mid; else hi=mid;
  }
  return lo+(p-cdf[lo])/(cdf[hi]-cdf[lo]);
}

export function sampleOrbital(state,count=32000) {
  const extent=Math.max(30,8*state.n**2),steps=8192,dr=extent/steps,dmu=2/steps;
  const radialWeights=Float64Array.from({length:steps+1},(_,i)=>(i*dr*radial(state,i*dr))**2);
  const angularWeights=Float64Array.from({length:steps+1},(_,i)=>legendre(state.l,state.ma,-1+i*dmu)**2);
  const radialCdf=cumulative(radialWeights,dr),angularCdf=cumulative(angularWeights,dmu);
  // Opposite m and spin choices share identical density samples.
  let seed=(0x6d2b79f5+state.n*1709+state.l*3253)>>>0;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)+.5)/4294967296;};
  const positions=new Float64Array(count*3);
  for (let i=0;i<count;i++) {
    const r=quantile(radialCdf.cdf,random())*dr;
    const mu=-1+quantile(angularCdf.cdf,random())*dmu;
    const phi=2*Math.PI*random(),s=r*Math.sqrt(Math.max(0,1-mu*mu));
    positions.set([s*Math.cos(phi),s*Math.sin(phi),r*mu],i*3);
  }
  const nodes=[];
  if (state.k) {
    let previous=laguerre(state.k,state.alpha,0);
    for (let i=1;i<=steps;i++) {
      const value=laguerre(state.k,state.alpha,2*i*dr/state.n);
      if (value*previous<0) {
        let lo=(i-1)*dr,hi=i*dr;
        for (let j=0;j<40;j++) {
          const mid=(lo+hi)/2;
          if (laguerre(state.k,state.alpha,2*mid/state.n)*previous>0) lo=mid; else hi=mid;
        }
        nodes.push((lo+hi)/2);
      }
      previous=value;
    }
  }
  return {positions,displayRadius:quantile(radialCdf.cdf,.995)*dr,
    radialNormalization:radialCdf.norm,radialNodes:nodes};
}

// Equal-weight Born samples turn a density quantile into a probability-mass
// selection. Keep a highest-density region, rather than a radial or spatial cut.
export function selectProbabilityRegion(state,sample,fraction=.9) {
  const count=sample.positions.length/3,kept=Math.round(count*fraction);
  if (!(fraction>0&&fraction<=1)) throw new Error('Invalid retained probability');
  const densities=Float64Array.from({length:count},(_,i)=>densityAt(state,...sample.positions.subarray(i*3,i*3+3)));
  const order=Uint32Array.from({length:count},(_,i)=>i).sort((a,b)=>densities[a]-densities[b]);
  const discarded=count-kept,mask=new Uint8Array(count);
  for (let i=discarded;i<count;i++) mask[order[i]]=1;
  const positions=new Float64Array(kept*3);
  let next=0,radius=0;
  for (let i=0;i<count;i++) {
    if(!mask[i])continue;
    const point=sample.positions.subarray(i*3,i*3+3);
    positions.set(point,next);next+=3;radius=Math.max(radius,Math.hypot(...point));
  }
  const threshold=discarded?(densities[order[discarded-1]]+densities[order[discarded]])/2:0;
  return {...sample,positions,displayRadius:radius*1.05,densityThreshold:threshold,
    probabilityFraction:kept/count,sourceCount:count,retainedCount:kept};
}
