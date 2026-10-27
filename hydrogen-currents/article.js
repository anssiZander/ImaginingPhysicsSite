import {createState,currentAt,radial,sampleOrbital,selectProbabilityRegion} from './current-physics.js?v=20261027-orbit-view';
import {PointCloudView} from './current-view.js?v=20261027-orbit-view';

const byId=id=>document.getElementById(id);
const ns='http://www.w3.org/2000/svg';
const orbitalSelect=byId('orbital-select'),spinSelect=byId('spin-direction'),phaseSelect=byId('phase-winding');
const playToggle=byId('flow-play-toggle'),speedControl=byId('flow-speed'),speedValue=byId('flow-speed-value');
const densityCanvas=byId('orbital-density'),flowCanvas=byId('orbital-flow');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let state=createState('1s'),component='spin',playing=!reducedMotion.matches,inView=false;
let animationFrame=null,lastFrameTime=null,playbackSpeed=Number(speedControl.value);
let model,shapeKey='',tracers=[];
const models=new Map();
const timeScale=()=>.6*state.n**3;
const cloudView=new PointCloudView(densityCanvas,flowCanvas,updateViewNote);

function updateViewNote() {
  if(!model)return;
  byId('orbital-view-note').textContent=`90% probability cloud · ${model.retainedCount.toLocaleString()} points · zoom ${cloudView.zoom.toFixed(1)}×`;
  flowCanvas.dataset.camera=[cloudView.azimuth,cloudView.elevation,cloudView.zoom].join(',');
  flowCanvas.dataset.points=model.retainedCount;flowCanvas.dataset.probability=model.probabilityFraction;
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
  byId('profile-note').textContent=`${model.radialNodes.length} radial ${model.radialNodes.length===1?'node':'nodes'}${model.radialNodes.length?' (dashed lines)':''}. This is the radial factor of local density, without the r² shell-volume weight. Angular structure is visible in the point cloud.`;
}

function rebuildOrbital() {
  const nextShape=`${state.key}:${Math.abs(state.m)}`;
  if (nextShape!==shapeKey) {
    shapeKey=nextShape;
    if (!models.has(shapeKey)) models.set(shapeKey,selectProbabilityRegion(state,sampleOrbital(state,100000),.9));
    model=models.get(shapeKey);
    cloudView.setDensity(model.positions,model.displayRadius);drawProfile();
    tracers=[];
    const positions=model.positions,stride=Math.floor(positions.length/3/1800);
    for (let i=0;i<positions.length;i+=stride*3) {
      const x=positions[i],y=positions[i+1],z=positions[i+2];
      const fields=currentAt(state,x,y,z);
      if (!Number.isFinite(fields.spinOmega)||!Number.isFinite(fields.phaseOmega)) continue;
      tracers.push({s:Math.hypot(x,y),z,angle:Math.atan2(y,x),spinOmega:fields.spinOmega,omega:0});
    }
  }
  byId('orbital-state').textContent=`${state.key} · n = ${state.n}, ℓ = ${state.l}, mℓ = ${state.m>0?'+':''}${state.m}`;
  updateViewNote();
  flowCanvas.setAttribute('aria-label',`${state.key} orbital with m equals ${state.m}: ${component==='phase'?'Schrödinger':component} probability current over a stationary point cloud`);
  updateCurrent();
}

function updateCurrent() {
  const spin=Number(spinSelect.value);
  for (const tracer of tracers) {
    const phase=state.m/(tracer.s*tracer.s),magnetization=spin*tracer.spinOmega;
    tracer.omega=component==='spin'?magnetization:component==='phase'?phase:phase+magnetization;
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

function drawFlow() {cloudView.setFlow(tracers,timeScale());}

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
byId('view-reset').addEventListener('click',()=>cloudView.reset());
byId('view-zoom-in').addEventListener('click',()=>cloudView.zoomBy(1.25));
byId('view-zoom-out').addEventListener('click',()=>cloudView.zoomBy(.8));
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
