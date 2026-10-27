import {createState,currentAt,densityAt,legendre,radial,sampleOrbital} from './current-physics.js?v=20261027-orbitals';

const byId=id=>document.getElementById(id);
const ns='http://www.w3.org/2000/svg';
const orbitalSelect=byId('orbital-select'),spinSelect=byId('spin-direction'),phaseSelect=byId('phase-winding');
const playToggle=byId('flow-play-toggle'),speedControl=byId('flow-speed'),speedValue=byId('flow-speed-value');
const densityCanvas=byId('orbital-density'),flowCanvas=byId('orbital-flow');
const densityContext=densityCanvas.getContext('2d'),flowContext=flowCanvas.getContext('2d');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let state=createState('1s'),component='spin',playing=!reducedMotion.matches,inView=false;
let animationFrame=null,lastFrameTime=null,playbackSpeed=Number(speedControl.value);
let model,shapeKey='',tracers=[];
const models=new Map();
const azimuth=.3,elevation=.43;
const right=[Math.cos(azimuth),Math.sin(azimuth),0];
const up=[-Math.sin(azimuth)*Math.sin(elevation),Math.cos(azimuth)*Math.sin(elevation),Math.cos(elevation)];
const toward=[Math.sin(azimuth)*Math.cos(elevation),-Math.cos(azimuth)*Math.cos(elevation),Math.sin(elevation)];
const timeScale=()=>.6*state.n**3;
const hiddenByCut=(x,y)=>x>0&&y<0;
const dot=(axis,x,y,z)=>axis[0]*x+axis[1]*y+axis[2]*z;
function project(x,y,z) {
  const scale=144/model.displayRadius;
  return {x:200+scale*dot(right,x,y,z),y:172-scale*dot(up,x,y,z),depth:dot(toward,x,y,z)/model.displayRadius};
}

function drawDensity() {
  const width=densityCanvas.width,height=densityCanvas.height,pixels=new Float32Array(width*height);
  const positions=model.positions;
  for (let i=0;i<positions.length;i+=3) {
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    if (hiddenByCut(x,y)||Math.hypot(x,y,z)>model.displayRadius) continue;
    const screen=project(x,y,z),px=Math.round(screen.x*2),py=Math.round(screen.y*2);
    for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) {
      const sx=px+dx,sy=py+dy;
      if(sx>=0&&sx<width&&sy>=0&&sy<height) pixels[sy*width+sx]+=Math.exp(-(dx*dx+dy*dy)/2);
    }
  }
  const nonzero=Array.from(pixels).filter(v=>v>0).sort((a,b)=>a-b);
  const reference=nonzero[Math.floor(nonzero.length*.995)]||1;
  const image=densityContext.createImageData(width,height);
  for (let i=0;i<pixels.length;i++) {
    const light=Math.pow(1-Math.exp(-pixels[i]/(reference*.6)),.65);
    image.data.set([11+75*light,17+127*light,29+137*light,255],i*4);
  }
  // The exposed faces show local density, so radial nodes remain visible in
  // the cutaway even where a projection through the remaining cloud overlaps.
  let peakRadial=0,peakAngular=0;
  for (let i=0;i<=1600;i++) {
    peakRadial=Math.max(peakRadial,radial(state,i*model.displayRadius/1600)**2);
    peakAngular=Math.max(peakAngular,(state.angularNorm*legendre(state.l,state.ma,-1+i/800))**2);
  }
  const peakDensity=peakRadial*peakAngular,worldPerPixel=model.displayRadius/144;
  for (let py=56;py<632;py++) for (let px=112;px<688;px++) {
    const horizontal=(px/2-200)*worldPerPixel,vertical=(172-py/2)*worldPerPixel;
    const x=horizontal>=0?horizontal/right[0]:0;
    const y=horizontal<0?horizontal/right[1]:0;
    const z=(vertical-up[0]*x-up[1]*y)/up[2];
    if (Math.hypot(x,y,z)>model.displayRadius) continue;
    const density=densityAt(state,x,y,z),shade=horizontal>=0?1:.72;
    const light=Math.pow(density/peakDensity,.35)*shade;
    const index=(py*width+px)*4;
    image.data.set([11+85*light,17+145*light,29+156*light,255],index);
  }
  densityContext.putImageData(image,0,0);
  densityContext.save();densityContext.scale(2,2);
  densityContext.strokeStyle='#93b4c0';densityContext.fillStyle='#afc7d2';densityContext.lineWidth=1;
  densityContext.beginPath();densityContext.moveTo(360,305);densityContext.lineTo(360,276);
  densityContext.moveTo(357,281);densityContext.lineTo(360,276);densityContext.lineTo(363,281);densityContext.stroke();
  densityContext.font='12px Segoe UI, sans-serif';densityContext.fillText('z',367,281);densityContext.restore();
}

function drawProfile() {
  const count=500,extent=model.displayRadius;
  const values=Array.from({length:count+1},(_,i)=>radial(state,i*extent/count)**2);
  const max=Math.max(...values),coords=values.map((v,i)=>`${42+i*368/count},${216-177*v/max}`);
  byId('profile-line').setAttribute('d','M'+coords.join(' L'));
  byId('profile-area').setAttribute('d','M42,216 L'+coords.join(' L')+' L410,216 Z');
  byId('profile-extent').textContent=extent.toFixed(1);
  byId('profile-title').textContent=`Radial density factor for ${state.key}, with ${model.radialNodes.length} radial nodes`;
  byId('profile-nodes').replaceChildren();
  for (const node of model.radialNodes) {
    const line=document.createElementNS(ns,'line'),x=42+node/extent*368;
    for (const [name,value] of Object.entries({x1:x,x2:x,y1:32,y2:216,stroke:'#8192af','stroke-dasharray':'3 5','stroke-opacity':.55})) line.setAttribute(name,value);
    byId('profile-nodes').append(line);
  }
  const formula=`|R_{${state.n},${state.l}}(r)|^2`;
  if (window.katex) katex.render(formula,byId('profile-formula'),{throwOnError:false});
  else byId('profile-formula').textContent=`Radial density factor |R${state.n},${state.l}(r)|²`;
  byId('profile-note').textContent=`${model.radialNodes.length} radial ${model.radialNodes.length===1?'node':'nodes'}${model.radialNodes.length?' (dashed lines)':''}. This is the radial factor of local density, without the r² shell-volume weight. Angular structure is visible in the cutaway.`;
}

function rebuildOrbital() {
  const nextShape=`${state.key}:${Math.abs(state.m)}`;
  if (nextShape!==shapeKey) {
    shapeKey=nextShape;
    if (!models.has(shapeKey)) models.set(shapeKey,sampleOrbital(state));
    model=models.get(shapeKey);
    drawDensity();drawProfile();
    tracers=[];
    const positions=model.positions,stride=Math.floor(positions.length/3/440);
    for (let i=0;i<positions.length;i+=stride*3) {
      const x=positions[i],y=positions[i+1],z=positions[i+2],r=Math.hypot(x,y,z);
      if (r>model.displayRadius) continue;
      const fields=currentAt(state,x,y,z);
      if (!Number.isFinite(fields.spinOmega)||!Number.isFinite(fields.phaseOmega)) continue;
      tracers.push({s:Math.hypot(x,y),z,angle:Math.atan2(y,x),spinOmega:fields.spinOmega,omega:0});
    }
  }
  byId('orbital-state').textContent=`${state.key} · n = ${state.n}, ℓ = ${state.l}, mℓ = ${state.m>0?'+':''}${state.m}`;
  byId('orbital-view-note').textContent=`Oblique view · cut faces show local density · frame radius ${model.displayRadius.toFixed(1)}a₀`;
  flowCanvas.setAttribute('aria-label',`${state.key} orbital with m equals ${state.m}: ${component==='phase'?'Schrödinger':component} probability current over a stationary density cutaway`);
  updateCurrent();
}

function updateCurrent() {
  const spin=Number(spinSelect.value);
  for (const tracer of tracers) {
    const phase=state.m/(tracer.s*tracer.s),magnetization=spin*tracer.spinOmega;
    tracer.omega=component==='spin'?magnetization:component==='phase'?phase:phase+magnetization;
    tracer.color=Math.abs(tracer.omega)<1e-12?'#d6e6eb':tracer.omega>0?'#ffb969':'#afa1ff';
  }
  let text;
  if (component==='phase') {
    text=state.m===0?`For ${state.key} with mℓ = 0, the spatial wavefunction is real and the Schrödinger current vanishes. Switch to spin or total current to see the circulation.`
      :`With mℓ = ${state.m>0?'+':''}${state.m}, the Schrödinger current is ${state.m>0?'counterclockwise':'clockwise'} around z. Changing the spin direction leaves this contribution unchanged.`;
  } else if (component==='total'&&state.m===0) {
    text=`For ${state.key} with mℓ = 0, the Schrödinger contribution is zero, so the total current equals the spin current. Reversing spin reverses the flow while preserving this density.`;
  } else if (component==='total') {
    text=`The phase and spin contributions add at each point in the ${state.key} orbital. Compare the three switches to see where they reinforce or oppose one another. Changing current contribution leaves the density and playback scale fixed.`;
  } else if (state.key==='1s') {
    text=`The spherical 1s density carries a spin current ${spin>0?'counterclockwise':'clockwise'} around z, viewed from +z. Its Schrödinger current is zero.`;
  } else if (state.key==='2p'&&state.m===0) {
    text=`The 2p_z lobes both carry ${spin>0?'counterclockwise':'clockwise'} spin current around z, viewed from +z. Their opposite wavefunction signs do not reverse the current.`;
  } else {
    text=`The ${state.key} density gradient sets the spin current. It can reverse direction on opposite slopes of a density lobe. Reversing spin reverses this contribution while preserving the density.`;
  }
  byId('flow-explanation').textContent=text;
  document.querySelectorAll('[data-component]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.component===component)));
  flowCanvas.setAttribute('aria-label',`${state.key}, m equals ${state.m}, ${component==='phase'?'Schrödinger':component} current. ${text}`);
  drawFlow();
}

function drawFlow() {
  flowContext.clearRect(0,0,flowCanvas.width,flowCanvas.height);
  flowContext.save();flowContext.scale(2,2);
  const visible=[];
  for (const tracer of tracers) {
    const x=tracer.s*Math.cos(tracer.angle),y=tracer.s*Math.sin(tracer.angle);
    if (hiddenByCut(x,y)) continue;
    visible.push({tracer,screen:project(x,y,tracer.z)});
  }
  visible.sort((a,b)=>a.screen.depth-b.screen.depth);
  for (const {tracer,screen} of visible) {
    const moving=Math.abs(tracer.omega)>1e-12;
    const opacity=.48+.37*(screen.depth+1)/2;
    flowContext.strokeStyle=tracer.color;flowContext.fillStyle=tracer.color;flowContext.lineWidth=1.1;
    if (moving) {
      const span=Math.sign(tracer.omega)*Math.min(.25,Math.abs(tracer.omega)*timeScale()*.2);
      flowContext.globalAlpha=opacity*.4;flowContext.beginPath();
      let started=false;
      for (let j=0;j<=5;j++) {
        const angle=tracer.angle-span*(1-j/5),x=tracer.s*Math.cos(angle),y=tracer.s*Math.sin(angle);
        if (hiddenByCut(x,y)) {started=false;continue;}
        const p=project(x,y,tracer.z);
        if(started) flowContext.lineTo(p.x,p.y);else flowContext.moveTo(p.x,p.y);
        started=true;
      }
      flowContext.stroke();
    }
    flowContext.globalAlpha=moving?opacity:.35;
    flowContext.beginPath();flowContext.arc(screen.x,screen.y,moving?1.65:1.15,0,2*Math.PI);flowContext.fill();
  }
  flowContext.restore();
}

function animate(now) {
  const elapsed=lastFrameTime===null?0:(now-lastFrameTime)/1000;
  lastFrameTime=now;
  for (const tracer of tracers) tracer.angle=(tracer.angle+tracer.omega*elapsed*timeScale()*playbackSpeed)%(2*Math.PI);
  drawFlow();animationFrame=requestAnimationFrame(animate);
}

function syncPlayback() {
  if (animationFrame!==null) cancelAnimationFrame(animationFrame);
  animationFrame=null;lastFrameTime=null;
  playToggle.textContent=playing?'Pause':'Play';playToggle.setAttribute('aria-pressed',String(playing));
  playToggle.setAttribute('aria-label',playing?'Pause current animation':'Play current animation');
  if (playing&&inView&&!document.hidden) animationFrame=requestAnimationFrame(animate);
}

function selectOrbital() {
  state=createState(orbitalSelect.value);
  phaseSelect.replaceChildren();
  for (let m=-state.l;m<=state.l;m++) {
    const option=document.createElement('option');option.value=m;option.textContent=`mℓ = ${m>0?'+':''}${m}`;
    phaseSelect.append(option);
  }
  phaseSelect.value=state.m;phaseSelect.disabled=state.l===0;
  rebuildOrbital();syncPlayback();
}

orbitalSelect.addEventListener('change',selectOrbital);
phaseSelect.addEventListener('change',()=>{state=createState(orbitalSelect.value,Number(phaseSelect.value));rebuildOrbital();});
spinSelect.addEventListener('change',updateCurrent);
document.querySelectorAll('[data-component]').forEach(button=>button.addEventListener('click',()=>{component=button.dataset.component;updateCurrent();}));
playToggle.addEventListener('click',()=>{playing=!playing;syncPlayback();});
speedControl.addEventListener('input',()=>{playbackSpeed=Number(speedControl.value);speedValue.value=`${playbackSpeed}×`;});
reducedMotion.addEventListener('change',event=>{if(event.matches){playing=false;syncPlayback();}});
document.addEventListener('visibilitychange',syncPlayback);
const flowObserver=new IntersectionObserver(entries=>{inView=entries.some(entry=>entry.isIntersecting);syncPlayback();});
flowObserver.observe(flowCanvas);selectOrbital();

const renderArticleMath=()=>{
  if(window.renderMathInElement) renderMathInElement(document.querySelector('.orbital-post'),{
    delimiters:[{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false}],throwOnError:false
  });
  drawProfile();
};
if(document.readyState==='complete') renderArticleMath();else document.addEventListener('DOMContentLoaded',renderArticleMath,{once:true});
const videos=[...document.querySelectorAll('video')];
videos.forEach(video=>video.addEventListener('play',()=>videos.forEach(other=>{if(other!==video)other.pause();})));
const comments=document.querySelector('[data-comments]');
if(comments) {
  const observer=new IntersectionObserver(entries=>{
    if(!entries.some(entry=>entry.isIntersecting))return;
    const script=document.createElement('script');script.src='../comments.js';document.body.append(script);observer.disconnect();
  },{rootMargin:'200px'});observer.observe(comments);
}
