// Reproducible, quantitative SVG figures. All waves and checkpoint amplitudes
// are evaluated by the pinned branch cores; no screenshots or data fitting.
import {mkdir, writeFile} from 'node:fs/promises';
import * as ordinary from '../demos/ordinary/ordinary-core.js';
import * as controlled from '../demos/wave-hadamard/multiregion-core.js';
import * as free from '../demos/free-box/multiregion-core.js';
import * as spin from '../demos/spin/multiregion-core.js';

const output = new URL('../images/', import.meta.url);
await mkdir(output, {recursive:true});
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const text = (x,y,s,fill='#d8e8f5',size=18,extra='') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" ${extra}>${esc(s)}</text>`;
const line = (x1,y1,x2,y2,color='#39566c',extra='') => `<path d="M${x1},${y1} L${x2},${y2}" stroke="${color}" fill="none" ${extra}/>`;
const rect = (x,y,w,h,color,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${extra}/>`;
const svg = (w,h,title,body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-labelledby="title"><title id="title">${esc(title)}</title><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#081725"/><stop offset="1" stop-color="#0e1124"/></linearGradient><linearGradient id="phase"><stop stop-color="#66d9e9"/><stop offset=".25" stop-color="#ac79ee"/><stop offset=".5" stop-color="#ef7966"/><stop offset=".75" stop-color="#b5eb66"/><stop offset="1" stop-color="#66d9e9"/></linearGradient></defs>${rect(0,0,w,h,'url(#bg)')}<g font-family="Segoe UI, Arial, sans-serif">${body}</g></svg>`;
const save = (name,w,h,title,body) => writeFile(new URL(name,output),svg(w,h,title,body));
const phaseLegend = (x,y) => rect(x,y,150,8,'url(#phase)','rx="3"') + text(x,y+25,'−π','#93acc2',13)+text(x+70,y+25,'0','#93acc2',13)+text(x+132,y+25,'π','#93acc2',13);

function sample(core,state,channel='scalar') {
  const points=[];
  for(let y=0;y<56;y++)for(let x=0;x<56;x++) {
    const a=core.waveAt(state,(x+.5)/56,1-(y+.5)/56);
    const up=a[0]*a[0]+a[1]*a[1],down=a.length===4?a[2]*a[2]+a[3]*a[3]:0;
    points.push({x,y,density:channel==='total'?up+down:channel==='down'?down:up,
      phase:Math.atan2(a[channel==='down'?3:1],a[channel==='down'?2:0]), polarization:(up-down)/(up+down||1)});
  }
  return points;
}
function map(points,x,y,size,maxDensity,{densityOnly=false,spinColor=false,target=true}={}) {
  let body=''; const d=size/56;
  for(const p of points) {
    const intensity=Math.pow(Math.min(1,p.density/maxDensity),.55);
    const hue=spinColor?262-65*p.polarization:densityOnly?188:p.phase*180/Math.PI;
    body+=rect((x+p.x*d).toFixed(2),(y+p.y*d).toFixed(2),(d+.06).toFixed(2),(d+.06).toFixed(2),`hsl(${hue.toFixed(1)} 68% ${(4+intensity*58).toFixed(1)}%)`);
  }
  for(let j=0;j<=4;j++)body+=line(x+j*size/4,y,x+j*size/4,y+size,'#a9d1e744')+line(x,y+j*size/4,x+size,y+j*size/4,'#a9d1e744');
  if(target)body+=rect(x+3*size/4,y,size/4,size/4,'none','stroke="#ff8296" stroke-width="2.5"');
  return body+rect(x,y,size,size,'none','stroke="#5a8297"');
}
const maximum = groups => Math.max(...groups.flat().map(p=>p.density));
function checkpoint(core, rounds=1, target=15) {
  let state=core.evolveGate(core.basisState(0,4),'prepare',1,target,0);
  for(let k=0;k<rounds;k++)for(const kind of ['oracle','inverse','reference','forward'])state=core.evolveGate(state,kind,1,target,0);
  return state;
}

// Hero: an isometric signed histogram beside the corresponding controlled wave.
const first=checkpoint(ordinary), waveFirst=checkpoint(controlled);
let hero=text(44,50,'GROVER SEARCH','#7dd7e4',15,'letter-spacing="3"')+text(44,94,'Sixteen amplitudes. One wave.','#edf5fc',34);
hero+=text(44,126,'After the first round · marked probability 47.27%','#a4bbd0',17);
const project=(x,y,z)=>[260+(x-y)*48,265+(x+y)*22-z*205];
for(let x=0;x<=4;x++) { const a=project(x,0,0),b=project(x,4,0); hero+=line(...a,...b,'#335a70'); }
for(let y=0;y<=4;y++) { const a=project(0,y,0),b=project(4,y,0); hero+=line(...a,...b,'#335a70'); }
for(let depth=0;depth<=6;depth++)for(let x=0;x<4;x++)for(let row=0;row<4;row++) {
  if(x+row!==depth)continue;
  const q=4*x+(3-row),v=first[2*q],marked=q===15;
  const p=[project(x+.12,row+.12,0),project(x+.88,row+.12,0),project(x+.88,row+.88,0),project(x+.12,row+.88,0)];
  const t=[project(x+.12,row+.12,v),project(x+.88,row+.12,v),project(x+.88,row+.88,v),project(x+.12,row+.88,v)];
  const poly=(pts,color)=>`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="${color}" stroke="${marked?'#ffb1a3':'#a96a64'}" stroke-width="1"/>`;
  hero+=poly([p[1],p[2],t[2],t[1]],marked?'#a74b55':'#713f48')+poly([p[2],p[3],t[3],t[2]],marked?'#d46c66':'#a75f59')+poly(p,marked?'#ee927d':'#c97a68');
  if(marked)hero+=text(t[2][0]+10,t[2][1]+20,'−11/16','#ffaf9b',20);
}
hero+=text(54,489,'SIGNED AMPLITUDES','#d6dfeb',15)+text(54,516,'H Sᵢ H = −D · global sign retained','#a1b4c9',15);
hero+=line(514,339,514,475,'#88a9bc')+line(508,339,520,339,'#88a9bc')+text(527,345,'0','#b8d4e5',16)+text(526,467,'−','#b8d4e5',21);
const hw=sample(controlled,waveFirst);hero+=map(hw,733,146,330,maximum([hw]));
hero+=text(733,510,'SPATIAL WAVE','#d6dfeb',15)+phaseLegend(911,493);
hero+=line(627,175,627,464,'#354052')+text(588,320,'→','#84d1df',35);
await save('hero.svg',1200,540,'Signed columns and a spatial wave after one Grover round',hero);

let reflection=text(35,38,'The first oracle lowers the mean to μ = 7/32','#dae8f5',23);
const panels=[{label:'After oracle',values:Array.from({length:16},(_,q)=>q===15?-.25:.25),mean:7/32,color:'#6ed5df'},
  {label:'Conventional diffuser D',values:Array.from({length:16},(_,q)=>q===15?11/16:3/16),mean:7/32,color:'#6ed5df'},
  {label:'Displayed mixer M = −D',values:Array.from({length:16},(_,q)=>q===15?-11/16:-3/16),mean:-7/32,color:'#e38c74'}];
panels.forEach((p,i)=>{
  const x=35+i*362,y=251,scale=205;
  reflection+=text(x,85,p.label,'#c9ddeb',19)+line(x,y,x+310,y,'#8fa3b5');
  reflection+=line(x,y-p.mean*scale,x+310,y-p.mean*scale,'#ffd783','stroke-dasharray="5 4"');
  p.values.forEach((v,q)=>{ const top=y-v*scale;reflection+=rect(x+q*19.4,Math.min(top,y),14,Math.abs(v*scale),q===15?'#ff7c91':p.color); });
  reflection+=text(x,410,i===0?'a → Owa':i===1?'a′ = 2μ − a':'a′ = a − 2μ','#adc6d7',18);
  reflection+=text(x+6,y-p.mean*scale-10,i===2?'final mean −7/32':'input mean +7/32','#ddbe79',13);
  const v=p.values[15];reflection+=text(x+272,y-v*scale+(v<0?22:-10),i===0?'−¼':i===1?'+11/16':'−11/16','#ffb1bf',16);
});
await save('reflection.svg',1100,430,'Mean reflection and its overall negative in the displayed convention',reflection);

let circuit=text(35,35,'Prepare once', '#90b8d0',18)+text(390,35,'Repeat this round three times', '#90b8d0',18);
for(let k=0;k<4;k++) {
  const y=90+k*37;circuit+=text(30,y+6,'|0⟩','#c5d9ee',20)+line(83,y,1050,y,'#587d9a');
  for(const x of [130,472,765])circuit+=rect(x,y-15,45,30,'#123c42','rx="5" stroke="#5cbbb9"')+text(x+15,y+6,'H','#d0fbf4',18);
}
for(const [x,label,color] of [[295,'Ow','#ff9aaf'],[614,'Sᵢ','#d3b0ff']])circuit+=rect(x,69,82,153,'#182238',`rx="7" stroke="${color}"`)+text(x+21,151,label,color,27);
circuit+=rect(917,69,80,153,'#2d2a1a','rx="7" stroke="#cfb471"')+text(937,150,'◴','#ffe19c',34);
circuit+=line(464,246,817,246,'#b799e7')+line(464,235,464,246,'#b799e7')+line(817,235,817,246,'#b799e7');
circuit+=text(535,278,'M = H Sᵢ H = −D','#ceb4ee',22)+text(906,278,'measure','#ddca9e',17);
await save('circuit.svg',1100,320,'The four-qubit Grover circuit with the displayed negative diffuser',circuit);

let iters=text(35,36,'Probability rotates; it does not increase forever.','#dcebf7',24);
const cx=k=>90+k*88, cy=p=>263-p*182;
for(const p of [0,.5,1])iters+=line(90,cy(p),970,cy(p),'#2c475d')+text(31,cy(p)+5,`${p*100}%`,'#91aabf',15);
let path='';for(let j=0;j<=600;j++){const k=j/60;path+=`${j?'L':'M'}${cx(k).toFixed(2)},${cy(ordinary.expectedProbability(k)).toFixed(2)} `;}
iters+=`<path d="${path}" fill="none" stroke="#6ab4c7" stroke-width="2.5"/>`;
for(let k=0;k<=10;k++) {const p=ordinary.expectedProbability(k);iters+=`<circle cx="${cx(k)}" cy="${cy(p)}" r="${k===3?7:5}" fill="${k===3?'#ffd783':'#8fe2e5'}"/>`+text(cx(k)-5,290,k,'#afc4d5',16);}
iters+=text(cx(3)-60,cy(ordinary.expectedProbability(3))-19,'96.13% · stop','#ffdd93',18)+text(985,293,'rounds','#91aabf',15);
await save('iterations.svg',1100,330,'Grover marked probability over ten rounds for sixteen states',iters);

let encoding=text(32,35,'Four overlapping, orthonormal packets along one axis','#d7e7f7',23);
const colors=['#65dbe1','#dfb879','#b3a5f7','#ed8ca5'];
const px=x=>65+970*x,py=f=>166-f*34;
for(let j=0;j<5;j++)encoding+=line(px(j/4),64,px(j/4),223,'#263f56');
encoding+=line(65,py(0),1035,py(0),'#547082');
for(let j=0;j<4;j++){let d='';for(let k=0;k<=400;k++){const x=k/400;d+=`${k?'L':'M'}${px(x).toFixed(2)},${py(controlled.axisPacket(j,x)).toFixed(2)} `;}
  encoding+=`<path d="${d}" stroke="${colors[j]}" fill="none" stroke-width="2.3"/>`+text(px((j+.5)/4)-9,64,`f${j}`,colors[j],19);}
encoding+=text(65,245,'0','#a3b9c9',14)+text(1018,245,'L','#a3b9c9',14);
const encInitial=sample(controlled,controlled.basisState()),encPrepared=sample(controlled,checkpoint(controlled,0)),encMax=maximum([encInitial,encPrepared]);
encoding+=map(encInitial,70,281,205,encMax,{densityOnly:true,target:false})+map(encPrepared,615,281,205,encMax,{densityOnly:true,target:false});
encoding+=text(297,328,'Input φ₀₀','#d9eaf5',24)+text(297,363,'One logical mode','#9fbcd2',17)+text(297,390,'Spatial tails overlap','#9fbcd2',17);
encoding+=text(841,328,'H preparation','#d9eaf5',22)+text(841,363,'16 equal coefficients','#9fbcd2',17)+text(841,390,'Structured density','#9fbcd2',17);
await save('encoding.svg',1100,520,'Spatial packet encoding from the first four sine modes',encoding);

async function waveRow(filename,title,core,states,labels,options={}) {
  const samples=states.map((state,i)=>sample(core,state,options.channels?.[i]||'scalar'));
  const max=maximum(samples);let body=text(32,34,title,'#d8eaf7',23);
  samples.forEach((points,i)=>{const x=41+i*360;body+=text(x,73,labels[i],'#a9c8df',18)+map(points,x,91,270,max,{densityOnly:options.densityOnly,spinColor:options.channels?.[i]==='total'});});
  body+=text(42,391,options.foot||'Hue: phase · brightness: density · common brightness scale','#9cb7c9',15);
  if(!options.densityOnly)body+=phaseLegend(890,374);
  await save(filename,1100,410,title,body);
}
const prepared=checkpoint(controlled,0),postOracle=controlled.evolveGate(prepared,'oracle',1,15);
await waveRow('wave-hadamard.svg','The same coefficients now form a continuous wave',controlled,[prepared,postOracle,waveFirst],['Prepared · P(w) = 6.25%','Oracle · P(w) = 6.25%','Mixer · P(w) = 47.27%']);
const freeInitial=free.basisState();
await waveRow('free-evolution.svg','Free preparation from exact energy phases',free,[freeInitial,free.evolveGate(freeInitial,'prepare',.5,15),checkpoint(free,0)],['t = 0 · initial packet','t = T/2 · interference','t = T · balanced modes']);

let freeCircuit=text(32,36,'All spatial mixing is forward in time.','#dceaf5',24);
const boxes=[{x:35,w:110,label:'wait T',sub:'prepare',color:'#64d5d1'},{x:185,w:110,label:'Ow',sub:'phase pulse',color:'#f38da3'},
  {x:329,w:385,label:'wait 7T',sub:'A† = Ubox(7T)',color:'#a8a3f1'},{x:748,w:110,label:'Sᵢ',sub:'phase pulse',color:'#f38da3'},
  {x:892,w:150,label:'wait T',sub:'A = Ubox(T)',color:'#64d5d1'}];
freeCircuit+=line(25,115,1070,115,'#567f92');
for(const b of boxes) freeCircuit+=rect(b.x,76,b.w,74,'#132239',`rx="7" stroke="${b.color}"`)+text(b.x+b.w/2,122,b.label,b.color,25,'text-anchor="middle"')+text(b.x+b.w/2,179,b.sub,'#9dbcd0',16,'text-anchor="middle"');
freeCircuit+=line(329,205,1042,205,'#8e92ca')+text(489,237,'Mₐ = A Sᵢ A† · repeat with the oracle','#bfc2ea',19);
await save('free-circuit.svg',1100,260,'Free-box search circuit with a seven-T inverse wait',freeCircuit);
const spinFinal=checkpoint(spin,4,30);
await waveRow('spin.svg','A joint position–spin target · four rounds · P(w) = 99.92%',spin,[spinFinal,spinFinal,spinFinal],['Up-channel density','Down-channel density','Total · local z-spin colors'],{channels:['up','down','total'],densityOnly:true,foot:'Density: common scale · total view: cyan = up, magenta = down, violet = balanced'});

// Exact values for the checks and for regenerating prose/table references.
const numbers={ordinaryRounds:Array.from({length:5},(_,k)=>{
  const a=checkpoint(ordinary,k);return {round:k,marked:a[30],unmarked:a[2],probability:a[30]**2};
}),freeRounds:Array.from({length:4},(_,k)=>free.probabilities(checkpoint(free,k))[15]),spinFinal:spin.probabilities(spinFinal)[30]};
await writeFile(new URL('checkpoints.json',output),JSON.stringify(numbers,null,2)+'\n');
console.log('Generated 9 quantitative SVG figures and checkpoint data.');
