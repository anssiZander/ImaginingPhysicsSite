// Each spatial packet stores [up.re, up.im, down.re, down.im].
// Box size and mass stay fixed when the number of retained modes changes.
export const SIDE = 4;
export const MAX_SIDE = 5;
export const REVIVAL_TIME = 19.2;
export const FREE_OMEGA = 2 * Math.PI / REVIVAL_TIME;
export const HBAR_OVER_M = 2 * FREE_OMEGA / Math.PI ** 2;
const models = new Map();
const preparations = new Map();

function sineOverlap(n,m,a,b) {
  if(n===m)return b-a-(Math.sin(2*n*Math.PI*b)-Math.sin(2*n*Math.PI*a))/(2*n*Math.PI);
  const primitive=x=>Math.sin((n-m)*Math.PI*x)/((n-m)*Math.PI)-Math.sin((n+m)*Math.PI*x)/((n+m)*Math.PI);
  return primitive(b)-primitive(a);
}
export function gridModel(side=SIDE) {
  if(!Number.isInteger(side)||side<2||side>MAX_SIDE)throw new RangeError('Grid size must be 2, 3, 4 or 5.');
  if(models.has(side))return models.get(side);
  const spatialCount=side*side,stateCount=2*spatialCount,mixTime=REVIVAL_TIME/(2*side);
  const inverseFactor=2*side-1,inverseTime=REVIVAL_TIME-mixTime;
  const iterations=Math.round(Math.PI/(4*Math.asin(1/Math.sqrt(stateCount)))-.5);
  const packetTransform=Array.from({length:side},(_,j)=>Float64Array.from({length:side},(_,n)=>
    (n===side-1?1/Math.sqrt(side):Math.sqrt(2/side))*Math.sin(Math.PI*(j+.5)*(n+1)/side)));
  const cellOverlaps=Array.from({length:side},(_,j)=>Array.from({length:side},(_,n)=>
    Float64Array.from({length:side},(_,m)=>sineOverlap(n+1,m+1,j/side,(j+1)/side))));
  const spatialLabels=Array.from({length:spatialCount},(_,q)=>Math.floor(q/side)+','+(q%side));
  const labels=Array.from({length:stateCount},(_,q)=>spatialLabels[q>>1]+','+(q&1?'↓':'↑'));
  const gates=Object.freeze([
    {kind:'prepare',name:'Prepare · free T + spin rotation',symbol:'A',iteration:0,duration:mixTime},
    ...Array.from({length:iterations},(_,i)=>[
      {kind:'oracle',name:'Joint position–spin oracle',symbol:'Oω',iteration:i+1,duration:1.6},
      {kind:'inverse',name:'A† · forward '+inverseFactor+'T + inverse spin',symbol:'A†',iteration:i+1,duration:inverseTime},
      {kind:'reference',name:'Reference phase on initial state',symbol:'Sᵢ',iteration:i+1,duration:1.6},
      {kind:'forward',name:'Forward · free T + spin rotation',symbol:'A',iteration:i+1,duration:mixTime},
    ]).flat(),
  ].map(Object.freeze));
  const model={side,spatialCount,stateCount,mixTime,inverseTime,inverseFactor,iterations,
    packetTransform,cellOverlaps,spatialLabels,labels,gates};
  // Register before preparing, because the propagator resolves the same model.
  models.set(side,model);
  model.preparedState=evolveMixer(basisState(0,side),1);
  return Object.freeze(model);
}
export function modelOfState(state) {return gridModel(Math.sqrt(state.length/4));}
export function basisState(q=0,side=SIDE) {
  if(!Number.isInteger(side)||side<2||side>MAX_SIDE)throw new RangeError('Unsupported grid size.');
  if(!Number.isInteger(q)||q<0||q>=2*side*side)throw new RangeError('Invalid joint state.');
  const state=new Float64Array(4*side*side);state[2*q]=1;return state;
}
export function sineCoefficients(state) {
  const {side,packetTransform:T}=modelOfState(state),out=new Float64Array(state.length);
  for(let n=0;n<side;n++)for(let m=0;m<side;m++)for(let x=0;x<side;x++)for(let y=0;y<side;y++){
    const w=T[x][n]*T[y][m];
    for(let k=0;k<4;k++)out[4*(side*n+m)+k]+=w*state[4*(side*x+y)+k];
  }return out;
}
export function packetCoefficients(modes) {
  const {side,packetTransform:T}=modelOfState(modes),out=new Float64Array(modes.length);
  for(let x=0;x<side;x++)for(let y=0;y<side;y++)for(let n=0;n<side;n++)for(let m=0;m<side;m++){
    const w=T[x][n]*T[y][m];
    for(let k=0;k<4;k++)out[4*(side*x+y)+k]+=w*modes[4*(side*n+m)+k];
  }return out;
}
export function rotateSpin(state,angle) {
  // Ry(angle)=exp(-i angle sigma_y/2), applied uniformly in space.
  const out=new Float64Array(state.length),c=Math.cos(angle/2),s=Math.sin(angle/2);
  for(let q=0;q<state.length;q+=4)for(let k=0;k<2;k++){
    const a=q+k;out[a]=c*state[a]-s*state[a+2];out[a+2]=s*state[a]+c*state[a+2];
  }return out;
}
export function evolveFree(state,intervals) {
  const {side}=modelOfState(state),modes=sineCoefficients(state);
  for(let n=0;n<side;n++)for(let m=0;m<side;m++){
    const angle=Math.PI*intervals*((n+1)**2+(m+1)**2)/side,c=Math.cos(angle),s=Math.sin(angle);
    for(let spin=0;spin<2;spin++){
      const q=4*(side*n+m)+2*spin,re=modes[q],im=modes[q+1];
      modes[q]=c*re+s*im;modes[q+1]=c*im-s*re;
    }
  }return packetCoefficients(modes);
}
export function evolveMixer(state,p,inverse=false) {
  const {inverseFactor}=modelOfState(state);
  // Positive-time spatial inverse uses the rest of one full box revival.
  return rotateSpin(evolveFree(state,(inverse?inverseFactor:1)*p),(inverse?-1:1)*Math.PI*p/2);
}
export function preparedStateFor(initial=0,side=SIDE) {
  const model=gridModel(side);
  if(initial===0)return model.preparedState;
  const key=side+'/'+initial;
  if(!preparations.has(key))preparations.set(key,evolveMixer(basisState(initial,side),1));
  return preparations.get(key);
}
export function phasePulse(state,target,p) {
  const out=Float64Array.from(state),r=2*target,c=Math.cos(Math.PI*p),s=Math.sin(Math.PI*p);
  out[r]=c*state[r]+s*state[r+1];out[r+1]=c*state[r+1]-s*state[r];return out;
}
export function evolveGate(state,kind,progress,target,initial=0) {
  if(kind==='prepare'||kind==='forward')return evolveMixer(state,progress);
  if(kind==='inverse')return evolveMixer(state,progress,true);
  if(kind==='oracle')return phasePulse(state,target,progress);
  if(kind==='reference')return phasePulse(state,initial,progress);
  throw Error('Unknown gate: '+kind);
}
export function probabilities(state) {return Float64Array.from({length:state.length/2},(_,q)=>state[2*q]**2+state[2*q+1]**2);}
export function normSquared(state) {return state.reduce((s,v)=>s+v*v,0);}
export function expectedProbability(k,side=SIDE) {return Math.sin((2*k+1)*Math.asin(1/Math.sqrt(2*side*side)))**2;}
export function spinSummary(state) {
  let up=0,down=0,x=0,y=0;
  for(let q=0;q<state.length;q+=4){
    const [a,b,c,d]=state.slice(q,q+4);up+=a*a+b*b;down+=c*c+d*d;x+=2*(a*c+b*d);y+=2*(a*d-b*c);
  }return {up,down,bloch:[x,y,up-down],purity:(1+x*x+y*y+(up-down)**2)/2};
}
export function axisPacket(j,x,side=SIDE) {return gridModel(side).packetTransform[j].reduce((sum,w,n)=>sum+w*Math.SQRT2*Math.sin((n+1)*Math.PI*x),0);}
export function waveAt(state,x,y) {
  const {side}=modelOfState(state),fx=Array.from({length:side},(_,j)=>axisPacket(j,x,side)),fy=Array.from({length:side},(_,j)=>axisPacket(j,y,side));
  const out=[0,0,0,0];
  for(let j=0;j<side;j++)for(let k=0;k<side;k++)for(let s=0;s<4;s++)out[s]+=fx[j]*fy[k]*state[4*(side*j+k)+s];
  return out;
}
// region is a spatial cell; optional spin resolves a measurement channel.
export function boxProbability(state,region,spin=null) {
  const {side,spatialCount,cellOverlaps}=modelOfState(state),c=sineCoefficients(state);
  const ix=cellOverlaps[Math.floor(region/side)],iy=cellOverlaps[region%side];let weight=0;
  for(let q=0;q<spatialCount;q++)for(let r=0;r<spatialCount;r++)for(let s=0;s<2;s++){
    if(spin!==null&&spin!==s)continue;
    const a=4*q+2*s,b=4*r+2*s;
    weight+=(c[a]*c[b]+c[a+1]*c[b+1])*ix[Math.floor(q/side)][Math.floor(r/side)]*iy[q%side][r%side];
  }return Math.max(0,Math.min(1,weight));
}
export function effectiveBlochState(marked,unmarked) {
  const [mr,mi]=marked,[ur,ui]=unmarked,m=mr*mr+mi*mi,u=ur*ur+ui*ui,weight=m+u;
  if(weight<1e-12)return {vector:null,weight,conditionalMarked:null};
  return {vector:[2*(mr*ur+mi*ui)/weight,2*(mr*ui-mi*ur)/weight,(m-u)/weight],weight:Math.min(1,weight),conditionalMarked:m/weight};
}
export function projectGroverState(state,target,initial=0) {
  const {stateCount,side}=modelOfState(state),preparedState=preparedStateFor(initial,side),marked=[0,0],unmarked=[0,0];
  for(let q=0;q<stateCount;q++){
    const re=Math.sqrt(stateCount)*(preparedState[2*q]*state[2*q]+preparedState[2*q+1]*state[2*q+1]);
    const im=Math.sqrt(stateCount)*(preparedState[2*q]*state[2*q+1]-preparedState[2*q+1]*state[2*q]);
    if(q===target){marked[0]=re;marked[1]=im;}else{unmarked[0]+=re/Math.sqrt(stateCount-1);unmarked[1]+=im/Math.sqrt(stateCount-1);}
  }
  const bloch=effectiveBlochState(marked,unmarked);
  return {bloch,targetProbability:marked[0]**2+marked[1]**2,outsideProbability:Math.max(0,1-bloch.weight)};
}
export class SearchSimulation {
  constructor(target=30,side=SIDE,initial=0){this.model=gridModel(side);this.target=Math.min(target,this.model.stateCount-1);this.initial=initial;this.reset();}
  reset(){this.amplitudes=basisState(this.initial,this.model.side);this.completed=0;this.active=null;this.last=null;this.paused=false;this.autoplay=false;this.time=0;this.revision=(this.revision||0)+1;this.checkpoints=[];}
  setGridSize(side){
    if(!Number.isInteger(side)||side<2||side>MAX_SIDE)return false;
    if(side===this.model.side)return false;
    const oldSide=this.model.side;
    const resize=q=>2*(side*Math.min(side-1,Math.floor((q>>1)/oldSide))+Math.min(side-1,(q>>1)%oldSide))+(q&1);
    this.target=resize(this.target);this.initial=resize(this.initial);
    this.model=gridModel(side);this.reset();return true;
  }
  setTarget(target){if(this.active||!Number.isInteger(target)||target<0||target>=this.model.stateCount)return false;this.target=target;this.reset();return true;}
  setInitial(initial){if(this.active||!Number.isInteger(initial)||initial<0||initial>=this.model.stateCount)return false;this.initial=initial;this.reset();return true;}
  startNext(){
    if(this.active||this.completed>=this.model.gates.length)return false;
    this.active={...this.model.gates[this.completed],initial:this.initial,index:this.completed,elapsed:0,progress:0,startAmplitudes:Float64Array.from(this.amplitudes)};
    if(this.active.kind==='reference')this.active.name='Reference phase |'+this.model.labels[this.initial]+'⟩';
    return true;
  }
  runFull(){if(this.active)return false;this.reset();this.autoplay=true;return this.startNext();}
  advance(dt){
    if(this.paused||!Number.isFinite(dt)||dt<=0)return;let remaining=dt;
    while(this.active&&remaining>1e-12){
      const gate=this.active,step=Math.min(remaining,gate.duration-gate.elapsed);
      gate.elapsed+=step;this.time+=step;remaining-=step;gate.progress=Math.min(1,gate.elapsed/gate.duration);
      if(gate.duration-gate.elapsed<1e-10)gate.progress=1;
      this.amplitudes=evolveGate(gate.startAmplitudes,gate.kind,gate.progress,this.target,this.initial);
      if(gate.progress<1)break;
      this.last=gate;this.active=null;this.completed++;
      this.checkpoints.push({step:this.completed,kind:gate.kind,iteration:gate.iteration,targetProbability:probabilities(this.amplitudes)[this.target]});
      if(this.autoplay&&this.completed<this.model.gates.length)this.startNext();else this.autoplay=false;
    }
  }
  snapshot(){
    const gate=this.active||this.last,{side,stateCount,iterations,mixTime,inverseTime}=this.model;
    return {side,stateCount,iterations,mixTime,inverseTime,target:this.target,targetRegion:this.target>>1,targetSpin:this.target&1,
      initial:this.initial,initialRegion:this.initial>>1,initialSpin:this.initial&1,
      completed:this.completed,busy:!!this.active,paused:this.paused,time:this.time,kind:gate?.kind||'input',iteration:gate?.iteration||0,
      progress:this.active?.progress??(this.last?1:0),norm:normSquared(this.amplitudes),probabilities:Array.from(probabilities(this.amplitudes)),
      amplitudes:Array.from(this.amplitudes),spin:spinSummary(this.amplitudes),checkpoints:this.checkpoints.map(x=>({...x}))};
  }
}
// Default-grid exports preserve the existing numerical tools' entry points.
// Runtime views and propagators always use their state's own grid model.
const defaultModel=gridModel(SIDE);
export const SPATIAL_COUNT=defaultModel.spatialCount,STATE_COUNT=defaultModel.stateCount;
export const ITERATIONS=defaultModel.iterations,MIX_TIME=defaultModel.mixTime;
export const SPATIAL_LABELS=defaultModel.spatialLabels,LABELS=defaultModel.labels;
export const GATES=defaultModel.gates,PACKET_TRANSFORM=defaultModel.packetTransform,PREPARED_STATE=defaultModel.preparedState;
