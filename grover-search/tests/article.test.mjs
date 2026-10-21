import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as ordinary from '../demos/ordinary/ordinary-core.js';
import * as controlled from '../demos/wave-hadamard/multiregion-core.js';
import * as free from '../demos/free-box/multiregion-core.js';
import * as spin from '../demos/spin/multiregion-core.js';
import {checkpoint, reflect, sweep, START, THETA} from '../reflection-core.js';
import {exampleStages, continuousExample, PREPARED_ANGLE} from '../construction-core.js';
const root = new URL('../',import.meta.url);
const near = (a,b,e=1e-11) => assert.ok(Math.abs(a-b)<e,`${a} ≠ ${b}`);

test('real rotation sandwich agrees with the full signed Hadamard mixer',()=>{
  for(const degrees of [-180,-150,-90,-25,0,20,PREPARED_ANGLE*180/Math.PI,90,150,180]) {
    const {stages}=exampleStages(degrees);
    const a=Math.cos(degrees*Math.PI/180),b=Math.sin(degrees*Math.PI/180),q=Math.sqrt(15);
    const expected=[[a,b],[(a+q*b)/4,(-q*a+b)/4],[-(a+q*b)/4,(-q*a+b)/4],[(7*a-q*b)/8,(-q*a-7*b)/8]];
    for(let step=0;step<4;step++) {
      const state=stages[step];
      near(state.vector.x,expected[step][0]);near(state.vector.y,expected[step][1]);
      near(state.norm,1);
    }
    near(stages[2].vector.x,-stages[1].vector.x);near(stages[2].vector.y,stages[1].vector.y);
    near(stages[0].reference.x,1/4);near(stages[1].reference.x,1);near(stages[2].reference.x,1);near(stages[3].reference.x,1/4);
    const input=new Float64Array(32);input[0]=a;
    for(let j=1;j<16;j++)input[2*j]=b/q;
    const actual=ordinary.hadamard(ordinary.referenceFlip(ordinary.hadamard(input)));
    near(actual[0],stages[3].vector.x);
    for(let j=1;j<16;j++)near(actual[2*j],stages[3].vector.y/q);
  }
});

test('real geometric sweep carries the mirror with its basis and shows the final symmetry',()=>{
  for(const degrees of [-150,0,20,75,90,150]) {
    const example=exampleStages(degrees);
    for(let gate=0;gate<3;gate++) for(const p of [0,.001,.25,.5,.75,.999,1]) {
      const frame=continuousExample(example,gate+p);
      const dot=(a,b)=>a.x*b.x+a.y*b.y;
      near(frame.norm,1);near(dot(frame.reference,frame.reference),1);near(dot(frame.mirror,frame.mirror),1);
      near(dot(frame.reference,frame.mirror),0);
      near(dot(frame.input,frame.reference),dot(example.input,example.stages[0].reference));
      near(dot(frame.reflected,frame.reference),-dot(frame.input,frame.reference));
      near(dot(frame.reflected,frame.mirror),dot(frame.input,frame.mirror));
      near(dot(frame.foot,frame.reference),0);
      const d={x:frame.reflected.x-frame.input.x,y:frame.reflected.y-frame.input.y};
      near(dot(d,frame.mirror),0);
      near((frame.input.x-frame.foot.x)**2+(frame.input.y-frame.foot.y)**2,
        (frame.reflected.x-frame.foot.x)**2+(frame.reflected.y-frame.foot.y)**2);
      assert.equal(frame.imaginary,undefined);
      if(gate===0) { near(frame.vector.x,frame.input.x);near(frame.vector.y,frame.input.y); }
      if(gate===2) { near(frame.vector.x,frame.reflected.x);near(frame.vector.y,frame.reflected.y); }
    }
    for(let boundary=1;boundary<=2;boundary++) {
      const left=continuousExample(example,boundary-1e-9),right=continuousExample(example,boundary+1e-9);
      near(left.vector.x,right.vector.x,1e-8);near(left.vector.y,right.vector.y,1e-8);
    }
    for(let step=0;step<=3;step++) {
      const frame=continuousExample(example,step);
      near(frame.vector.x,example.stages[step].vector.x);near(frame.vector.y,example.stages[step].vector.y);
    }
  }
  for(const invalid of [-1,3.1,NaN,Infinity])assert.throws(()=>continuousExample(exampleStages(),invalid),RangeError);
});

test('vector reflections agree with the full 16-state search, with the stated global sign',()=>{
  let a=ordinary.hadamard(ordinary.basisState());
  for(let step=0;step<=16;step++) {
    if(step>0) a=step%2 ? ordinary.oracle(a,15)
      : ordinary.hadamard(ordinary.referenceFlip(ordinary.hadamard(a)));
    const v=checkpoint(step),rounds=Math.floor(step/2),sign=(-1)**rounds;
    const angle=(2*rounds+1)*THETA;
    near(v.r,Math.cos(angle));near(v.w,(step%2?-1:1)*Math.sin(angle));
    near(v.r*v.r+v.w*v.w,1);
    near(v.w,sign*a[30]);
    for(let q=0;q<15;q++)near(v.r/Math.sqrt(15),sign*a[2*q]);
    near(v.w*v.w,ordinary.probabilities(a)[15]);
  }
  near(checkpoint(2).w,11/16);near(checkpoint(2).r/Math.sqrt(15),3/16);
  near(checkpoint(6).w**2,.9613189697265625);
  assert.ok(checkpoint(8).w**2<checkpoint(6).w**2);
});

test('the two mirror axes and geometric sweep keep their distinct meanings',()=>{
  const r={r:1,w:0},w={r:0,w:1},perpendicular={r:-START.w,w:START.r};
  assert.deepEqual(reflect(r,'oracle'),{r:1,w:-0});
  assert.deepEqual(reflect(w,'oracle'),{r:0,w:-1});
  near(reflect(START,'diffuser').r,START.r);near(reflect(START,'diffuser').w,START.w);
  near(reflect(perpendicular,'diffuser').r,-perpendicular.r);
  near(reflect(perpendicular,'diffuser').w,-perpendicular.w);
  for(let step=1;step<=8;step++) {
    const from=checkpoint(step-1),to=checkpoint(step);
    assert.deepEqual(sweep(from,to,0),from);assert.deepEqual(sweep(from,to,1),to);
    for(const p of [.1,.5,.9]) { const v=sweep(from,to,p);near(v.r*v.r+v.w*v.w,1); }
  }
});

test('published demos match their pinned sources and documented presentation overrides',async()=>{
  const sources=JSON.parse(await readFile(new URL('demos/sources.json',root)));
  const copyEdits=JSON.parse(await readFile(new URL('demos/copy-edits.json',root)));
  const presentation=JSON.parse(await readFile(new URL('demos/presentation.json',root)));
  for(const [name,demo] of Object.entries(sources.demos))for(const [path,hash] of Object.entries(demo.sha256)) {
    let bytes=await readFile(new URL(`demos/${name}/${path}`,root));
    const override=presentation.sha256[`${name}/${path}`];
    if(!path.endsWith('.png')) {
      let source=bytes.toString('utf8').replaceAll('\r\n','\n');
      for(const [before,after] of Object.entries(override?{}:copyEdits[`${name}/${path}`]||{})) {
        assert.ok(source.includes(after),`${name}/${path}: expected display copy ${after}`);
        assert.ok(!source.includes(before),`${name}/${path}: old display copy ${before}`);
        source=source.replaceAll(after,before);
      }
      bytes=Buffer.from(source);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'),override||hash,`${name}/${path}`);
  }
});

test('article checkpoints keep the global sign, and both scalar wave models have the same probabilities',async()=>{
  const numbers=JSON.parse(await readFile(new URL('images/checkpoints.json',root)));
  const theta=Math.asin(1/4);
  for(const core of [ordinary,controlled,free]) {
    let a=core.evolveGate(core.basisState(),'prepare',1,15);
    for(let k=0;k<=4;k++) {
      near(core.probabilities(a)[15],Math.sin((2*k+1)*theta)**2);
      near(core.normSquared(a),1);
      if(core!==free)for(let q=0;q<16;q++) {
        const expected=(-1)**k*(q===15?Math.sin((2*k+1)*theta):Math.cos((2*k+1)*theta)/Math.sqrt(15));
        near(a[q*2],expected);near(a[q*2+1],0);
      }
      near(numbers.ordinaryRounds[k].probability,Math.sin((2*k+1)*theta)**2);
      for(const kind of ['oracle','inverse','reference','forward'])a=core.evolveGate(a,kind,1,15);
    }
  }
  near(numbers.ordinaryRounds[1].marked,-11/16);
  near(numbers.ordinaryRounds[1].unmarked,-3/16);
  near(numbers.spinFinal,Math.sin(9*Math.asin(1/Math.sqrt(32)))**2);
});

test('the displayed free-box matrix and positive-time inverse follow the continuum spectrum',()=>{
  const T=Array.from({length:4},(_,j)=>Array.from({length:4},(_,k)=>k===3?Math.sin((j+.5)*Math.PI)/2:Math.SQRT1_2*Math.sin((j+.5)*(k+1)*Math.PI/4)));
  const z=[Math.SQRT1_2,-Math.SQRT1_2],one=[1,0],neg=[-1,0];
  const shown=[[z,neg,one,z],[neg,z,z,one],[one,z,z,neg],[z,one,neg,z]];
  for(let j=0;j<4;j++)for(let k=0;k<4;k++) {
    let re=0,im=0;
    for(let n=0;n<4;n++){const phase=-Math.PI*(n+1)**2/4;re+=T[j][n]*T[k][n]*Math.cos(phase);im+=T[j][n]*T[k][n]*Math.sin(phase);}
    near(re,shown[j][k][0]/2);near(im,shown[j][k][1]/2);
  }
  for(let q=0;q<16;q++) {
    const a=free.basisState(q),b=free.evolveGate(a,'prepare',1,15),c=free.evolveGate(b,'inverse',1,15);
    for(const p of free.probabilities(b))near(p,1/16);
    a.forEach((value,k)=>near(c[k],value));
  }
  near(free.gridModel(4).inverseTime,7*free.gridModel(4).mixTime);
});

test('the spin example marks up at the upper right and amplifies 1/32 with four rounds',()=>{
  let a=spin.evolveGate(spin.basisState(),'prepare',1,30);
  spin.probabilities(a).forEach(p=>near(p,1/32));
  for(let k=1;k<=4;k++) {
    for(const kind of ['oracle','inverse','reference','forward'])a=spin.evolveGate(a,kind,1,30);
    near(spin.probabilities(a)[30],Math.sin((2*k+1)*Math.asin(1/Math.sqrt(32)))**2);
    near(spin.normSquared(a),1);
  }
});

test('combined animation transports the current mean with every real column',()=>{
  const sim=new ordinary.SearchSimulation(); sim.setCombineMixer(true);
  for(let k=0;k<2;k++){sim.startNext();sim.advance(4);}
  const input=sim.snapshot().amplitudes,mean=7/32;
  sim.startNext();sim.advance(1.2);
  const a=sim.snapshot().amplitudes;
  for(let q=0;q<16;q++){near(a[2*q],input[2*q]-mean);near(a[2*q+1],-mean);}
  near(ordinary.mixerProjection(a)[0],0);near(ordinary.normSquared(a),1);
  sim.advance(1.2);near(sim.amplitudes[30],-11/16);
  sim.previousStep(); input.forEach((v,k)=>near(sim.amplitudes[k],v));
});
