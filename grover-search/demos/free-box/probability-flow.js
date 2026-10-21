import { SIDE, gridModel, modelOfState, FREE_OMEGA, sineCoefficients } from './multiregion-core.js?v=20261014-particles';

// Free intervals use the ordinary Schrodinger current. For ideal phase pulses,
// products of N sine modes contain only cosine frequencies 0..2N: solve the
// Neumann Poisson equation spectrally to select their curl-free transport.
export const FLOW_MODES = 2 * SIDE + 1;

function crossDensity(a, b) {
  const { side, stateCount } = modelOfState(a), modes = 2 * side + 1;
  const re = new Float64Array(modes * modes), im = new Float64Array(modes * modes);
  for (let q = 0; q < stateCount; q++) for (let r = 0; r < stateCount; r++) {
    const real = a[2*q]*b[2*r] + a[2*q+1]*b[2*r+1];
    const imag = a[2*q]*b[2*r+1] - a[2*q+1]*b[2*r];
    const nx = [Math.abs((Math.floor(q / side)) - (Math.floor(r / side))), (Math.floor(q / side)) + (Math.floor(r / side)) + 2];
    const ny = [Math.abs((q % side) - (r % side)), (q % side) + (r % side) + 2];
    // u_n u_m = cos((n-m) pi x) - cos((n+m) pi x).
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
      const sign = x === y ? 1 : -1, k = modes*nx[x]+ny[y];
      re[k] += sign*real; im[k] += sign*imag;
    }
  }
  return { re, im };
}

export function gateFlow(start, kind, target, duration, initial = 0) {
  const { side, stateCount } = modelOfState(start), modes = 2 * side + 1;
  if (kind === 'prepare' || kind === 'forward' || kind === 'inverse') {
    return { mode: 'free', side, modes, coefficients: sineCoefficients(start), span: FREE_OMEGA*duration, duration, direction: 1 };
  }
  const fixed = Float64Array.from(start), rotating = new Float64Array(start.length);
  if (kind === 'oracle' || kind === 'reference') {
    const q = kind === 'oracle' ? target : initial;
    rotating[2*q] = fixed[2*q]; rotating[2*q+1] = fixed[2*q+1];
    fixed[2*q] = 0; fixed[2*q+1] = 0;
  } else throw new Error(`Unknown phase gate: ${kind}`);
  const f = sineCoefficients(fixed), g = sineCoefficients(rotating);
  const cross = crossDensity(f,g), dc = cross.re.map(v => 2*v), ds = cross.im.map(v => 2*v);
  // fixed and rotating are orthogonal projector components. Their exact cross
  // integral is zero; discard only floating-point roundoff of this zero mode.
  dc[0] = 0; ds[0] = 0;
  const potential = new Float32Array(2 * modes * modes);
  for (let n = 0; n < modes; n++) for (let m = 0; m < modes; m++) {
    const k = modes*n+m, lambda = Math.PI**2*(n*n+m*m);
    if (lambda) { potential[2*k] = dc[k]/lambda; potential[2*k+1] = ds[k]/lambda; }
  }
  return { mode: 'phase', side, modes, f, g, dc, ds, potential, direction: 1, duration };
}

export function flowAt(flow, x, y, progress) {
  const { side, modes } = flow;
  if (flow.mode === 'free') return freeFlowAt(flow, x, y, progress);
  const cx = [], cy = [], sx = [], sy = [];
  for (let n = 0; n < modes; n++) {
    cx.push(Math.cos(n*Math.PI*x)); cy.push(Math.cos(n*Math.PI*y));
    sx.push(Math.sin(n*Math.PI*x)); sy.push(Math.sin(n*Math.PI*y));
  }
  const angle = flow.direction*Math.PI*progress, c = Math.cos(angle), s = Math.sin(angle);
  const rate = flow.direction*Math.PI/flow.duration;
  let drho = 0, jx = 0, jy = 0, divergence = 0, fr = 0, fi = 0, gr = 0, gi = 0;
  for (let n = 0; n < side; n++) for (let m = 0; m < side; m++) {
    const k = 2*(side*n+m), weight = 2*sx[n+1]*sy[m+1];
    fr += weight*flow.f[k]; fi += weight*flow.f[k+1];
    gr += weight*flow.g[k]; gi += weight*flow.g[k+1];
  }
  const re = fr+c*gr+s*gi, im = fi+c*gi-s*gr;
  for (let n = 0; n < modes; n++) for (let m = 0; m < modes; m++) {
    const k = modes*n+m, source = rate*(-s*flow.dc[k]+c*flow.ds[k]);
    drho += source*cx[n]*cy[m];
    if (!n && !m) continue;
    const chi = source/(Math.PI**2*(n*n+m*m));
    jx -= n*Math.PI*chi*sx[n]*cy[m]; jy -= m*Math.PI*chi*cx[n]*sy[m];
    divergence -= source*cx[n]*cy[m];
  }
  return { rho: re*re+im*im, drho, current: [jx,jy], divergence };
}

function freeFlowAt(flow, x, y, progress) {
  const { side } = flow;
  let re=0,im=0,dxr=0,dxi=0,dyr=0,dyi=0,dtr=0,dti=0;
  for (let n=1;n<=side;n++) for (let m=1;m<=side;m++) {
    const q=2*(side*(n-1)+m-1), energy=n*n+m*m, angle=flow.span*progress*energy;
    const c=Math.cos(angle),s=Math.sin(angle),a=flow.coefficients;
    const r=c*a[q]+s*a[q+1],i=c*a[q+1]-s*a[q];
    const sx=Math.sin(n*Math.PI*x),sy=Math.sin(m*Math.PI*y);
    const w=2*sx*sy,wx=2*n*Math.PI*Math.cos(n*Math.PI*x)*sy,wy=2*m*Math.PI*sx*Math.cos(m*Math.PI*y);
    re+=w*r;im+=w*i;dxr+=wx*r;dxi+=wx*i;dyr+=wy*r;dyi+=wy*i;
    dtr+=FREE_OMEGA*energy*w*i;dti-=FREE_OMEGA*energy*w*r;
  }
  const factor=2*FREE_OMEGA/Math.PI**2,drho=2*(re*dtr+im*dti);
  return {psi:[re,im],rho:re*re+im*im,drho,divergence:-drho,
    current:[factor*(re*dxi-im*dxr),factor*(re*dyi-im*dyr)]};
}

// Inverse CDF of the initial 1D packet. Stratification and a deterministic
// shuffle avoid an artificial spatial lattice without resampling during gates.
function initialCdf(x, packet, side) {
  const { packetTransform: PACKET_TRANSFORM } = gridModel(side);
  let sum = 0;
  for (let n = 1; n <= side; n++) for (let m = 1; m <= side; m++) {
    const integral = n === m ? x-Math.sin(2*n*Math.PI*x)/(2*n*Math.PI)
      : Math.sin((n-m)*Math.PI*x)/((n-m)*Math.PI)-Math.sin((n+m)*Math.PI*x)/((n+m)*Math.PI);
    sum += PACKET_TRANSFORM[packet][n-1]*PACKET_TRANSFORM[packet][m-1]*integral;
  }
  return sum;
}
export function sampleInitialParticles(count, seed = 73991, initial = 0, side = SIDE) {
  let randomState = seed >>> 0;
  const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0)/4294967296; };
  const quantilesX = new Float32Array(count), quantilesY = (Math.floor(initial / side)) === (initial % side) ? quantilesX : new Float32Array(count), order = Uint32Array.from({length:count},(_,i)=>i);
  const axes = [[Math.floor(initial / side), quantilesX]];
  if (quantilesX !== quantilesY) axes.push([initial % side, quantilesY]);
  for (let i = 0; i < count; i++) {
    const u = (i+.15+.7*random())/count;
    for (const [packet, quantiles] of axes) {
      let lo = 0, hi = 1;
      for (let k = 0; k < 34; k++) { const mid = .5*(lo+hi); if (initialCdf(mid, packet, side) < u) lo = mid; else hi = mid; }
      quantiles[i] = .5*(lo+hi);
    }
  }
  for (let i = count-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [order[i],order[j]] = [order[j],order[i]]; }
  const states = new Float32Array(4*count);
  for (let i = 0; i < count; i++) { states[4*i] = quantilesX[i]; states[4*i+1] = quantilesY[order[i]]; }
  return states;
}
