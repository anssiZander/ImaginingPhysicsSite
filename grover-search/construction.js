import {exampleStages,continuousExample} from './construction-core.js';

const root=document.getElementById('construction-lab');
const find=suffix=>document.getElementById(`construction-${suffix}`);
const svg=find('svg');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const signed=value=>`${value < -1e-9 ? '−' : '+'}${Math.abs(value).toFixed(3)}`;
const put=(suffix,value)=>{const element=find(suffix);if(element.textContent!==value)element.textContent=value;};
let position=0,angle=20,example=exampleStages(angle);
let current=continuousExample(example),motion=null,animationFrame;
const titles=['Start · a tilted reference','1 / Turn the reference onto the initial axis',
  '2 / Reflect across the simple mirror','3 / Turn everything back'];
const gateNames=['Rᵀ','Sᵢ','R'];
const explanations=[
  'The yellow arrow is the reference. Its perpendicular violet line is the mirror. We will build that reflection by changing basis.',
  'Turn the vector, reference, and mirror together. The reference lines up with the horizontal initial-state axis.',
  'Hold the basis fixed and flip the horizontal component. The vertical mirror now makes the reflection easy to see.',
  'Undo the turn. The original and reflected vectors now sit symmetrically across the tilted violet mirror.'
];
const referenceText=['Mirror perpendicular to |s⟩','Rᵀ|s⟩ = |i⟩','Sᵢ: flip the horizontal component','R Sᵢ Rᵀ = I − 2|s⟩⟨s|'];

function draw() {
  const width=Math.max(260,svg.getBoundingClientRect().width);
  const radius=Math.min(175,(width-112)/2),height=2*radius+100;
  const cx=width/2,cy=height/2;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.style.height=`${height}px`;
  const point=(v,scale=1)=>({x:cx+radius*scale*v.x,y:cy-radius*scale*v.y});
  const tip=point(current.vector),before=point(current.input),target=point(current.reflected);
  const ref=point(current.reference),mirror=point(current.mirror,1.08),mirrorOpposite=point(current.mirror,-1.08);
  const foot=point(current.foot),showReflection=position>1;
  const offset=(v,side=1)=>{
    const label=point(v,.67);
    label.x-=side*18*v.y;label.y-=side*18*v.x;
    return label;
  };
  const inputLabel=offset(current.input,1),vectorLabel=offset(current.vector,-1);
  // An angle arc makes the shared turn visible, with its sign reversed on return.
  let turnArc='';
  if (position>0 && position<1 || position>2 && position<3) {
    const from=position<1 ? Math.acos(1/4) : 0;
    const to=Math.atan2(current.reference.y,current.reference.x),r=radius*.36;
    if(Math.abs(to-from)>1e-6) turnArc=`<path class="construction-turn" d="M${cx+r*Math.cos(from)} ${cy-r*Math.sin(from)} A${r} ${r} 0 0 ${to<from?1:0} ${cx+r*Math.cos(to)} ${cy-r*Math.sin(to)}" />`;
  }
  // At the reflection stage, the chord joins the input to its mirror image.
  // Its midpoint lies on the mirror and the chord is perpendicular to it.
  let rightAngle='';
  if (showReflection && Math.abs(current.input.x*current.reference.x+current.input.y*current.reference.y)>.05) {
    const r=current.reference,m=current.mirror,size=9;
    const side=(current.input.x*r.x+current.input.y*r.y)>0?1:-1;
    rightAngle=`<path class="construction-right-angle" d="M${foot.x+side*size*r.x} ${foot.y-side*size*r.y} l${size*m.x} ${-size*m.y} l${-side*size*r.x} ${side*size*r.y}" />`;
  }
  find('drawing').innerHTML=`
    <defs>
      <marker id="construction-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#70e1df" /></marker>
      <marker id="construction-input-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#a8b5cb" /></marker>
      <marker id="construction-reference-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#e5c077" /></marker>
    </defs>
    <circle class="vector-circle" cx="${cx}" cy="${cy}" r="${radius}" />
    <path class="vector-axis" d="M${cx-radius-12} ${cy}H${cx+radius+12} M${cx} ${cy+radius+12}V${cy-radius-12}" />
    <path id="construction-mirror-line" class="construction-mirror" d="M${mirrorOpposite.x} ${mirrorOpposite.y}L${mirror.x} ${mirror.y}" />
    <path class="construction-reference" d="M${cx} ${cy}L${ref.x} ${ref.y}" marker-end="url(#construction-reference-arrow)" />
    ${turnArc}
    ${showReflection ? `<path id="construction-reflection-chord" class="vector-chord" d="M${before.x} ${before.y}L${target.x} ${target.y}" />
      ${rightAngle}<circle id="construction-mirror-foot" class="construction-mirror-foot" cx="${foot.x}" cy="${foot.y}" r="3" />
      <path id="construction-input-vector" class="vector-before" d="M${cx} ${cy}L${before.x} ${before.y}" marker-end="url(#construction-input-arrow)" />
      <circle class="construction-target-tip" cx="${target.x}" cy="${target.y}" r="4" />` : ''}
    <path class="vector-current" d="M${cx} ${cy}L${tip.x} ${tip.y}" marker-end="url(#construction-arrow)" />
    <circle id="construction-current-tip" class="vector-tip" cx="${tip.x}" cy="${tip.y}" r="3" />
    <circle class="vector-origin" cx="${cx}" cy="${cy}" r="3" />
    <text class="vector-label" x="${cx+radius+22}" y="${cy+24}" text-anchor="middle">|i⟩</text>
    <text class="vector-label" x="${cx+12}" y="${cy-radius-22}">|u⟩</text>
    <text class="vector-label vector-s-label" x="${ref.x+13}" y="${ref.y-8}">s</text>
    ${showReflection ? `<text class="vector-label construction-input-label" x="${inputLabel.x}" y="${inputLabel.y}" text-anchor="middle">v₀</text>` : ''}
    <text class="vector-label" x="${vectorLabel.x}" y="${vectorLabel.y}" text-anchor="middle">${position===3?'Mv₀':'v'}</text>
    <text class="vector-axis-note" x="${cx}" y="${height-12}" text-anchor="middle">Violet line = mirror · Yellow arrow = reference</text>`;
  Object.assign(root.dataset,{
    x:String(current.vector.x),y:String(current.vector.y),inputX:String(current.input.x),inputY:String(current.input.y),
    refX:String(current.reference.x),refY:String(current.reference.y),mirrorX:String(current.mirror.x),mirrorY:String(current.mirror.y),
    targetX:String(current.reflected.x),targetY:String(current.reflected.y),footX:String(current.foot.x),footY:String(current.foot.y),
    cx:String(cx),cy:String(cy),radius:String(radius)
  });
}

function render() {
  current=continuousExample(example,position);
  const stage=current.stage,partial=!Number.isInteger(position),playing=motion&&!motion.paused;
  put('status',`${titles[stage]}${partial ? playing?' · moving':' · paused':''}`);
  put('explanation',explanations[stage]);put('reference',referenceText[stage]);
  put('angle-value',`${angle}°`);
  put('initial',signed(current.vector.x));put('other',signed(current.vector.y));
  put('norm',Math.sqrt(current.norm).toFixed(3));
  put('components',`v = ${signed(current.vector.x)}|i⟩ ${signed(current.vector.y)}|u⟩`);
  put('change',position>=2 ? position===3?'Same signed mixer: M = −D':'Horizontal component reversed; vertical component preserved'
    : 'The reference and mirror turn with the vector.');
  find('change').classList.toggle('is-emphasized',position>=2);
  find('back').disabled=position===0;find('next').disabled=position===3||!!playing;
  const nextStage=Math.min(2,Math.floor(position));
  put('next',playing?'Moving…':position===3?'Complete':['Turn to initial axis','Reflect','Turn back'][nextStage]);
  put('pause',playing?'Pause':'Resume');find('pause').disabled=!motion&&!partial;
  find('reset').disabled=position===0&&angle===20;
  find('angle').disabled=false;find('progress').disabled=false;
  find('progress').value=String(Math.round(position*1000));
  const progressText=position===0?'Input':`${gateNames[stage-1]} · ${Math.round(current.progress*100)}%`;
  put('progress-value',progressText);find('progress').setAttribute('aria-valuetext',progressText);
  for(const item of root.querySelectorAll('[data-construction-stage]')) {
    const index=Number(item.dataset.constructionStage);
    item.classList.toggle('is-current',index===stage);item.classList.toggle('is-done',index<stage);
    if(index===stage)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
  }
  put('svg-description',`${titles[stage]}. Real vector coordinates ${signed(current.vector.x)} and ${signed(current.vector.y)}. The violet mirror is perpendicular to the yellow reference. ${position===3?'The original and final vectors are mirror images across the violet line.':''}`);
  Object.assign(root.dataset,{
    step:String(current.completed),position:String(position),progress:String(current.progress),norm:String(current.norm),
    angle:String(angle),busy:String(!!motion),paused:String(!!motion?.paused||(partial&&!motion)),ready:'true'
  });
  draw();
}

function cancel(){cancelAnimationFrame(animationFrame);motion=null;}
function animate(time) {
  if(!motion||motion.paused)return;
  if(motion.lastTime!==null){
    const distance=(time-motion.lastTime)/2200;
    position=motion.to>position?Math.min(motion.to,position+distance):Math.max(motion.to,position-distance);
  }
  motion.lastTime=time;
  if(position===motion.to)motion=null;
  render();if(motion)animationFrame=requestAnimationFrame(animate);
}
function travel(to) {
  cancel();if(position===to)return;
  if(reducedMotion.matches){position=to;render();return;}
  motion={to,lastTime:null,paused:false};render();animationFrame=requestAnimationFrame(animate);
}
find('next').addEventListener('click',()=>travel(Math.min(3,Math.floor(position+1e-9)+1)));
find('back').addEventListener('click',()=>travel(Math.max(0,Math.ceil(position-1e-9)-1)));
find('pause').addEventListener('click',()=>{
  if(!motion){travel(Math.min(3,Math.floor(position)+1));return;}
  motion.paused=!motion.paused;motion.lastTime=null;cancelAnimationFrame(animationFrame);
  if(!motion.paused)animationFrame=requestAnimationFrame(animate);render();
});
find('progress').addEventListener('input',()=>{cancel();position=Number(find('progress').value)/1000;render();});
find('reset').addEventListener('click',()=>{
  cancel();position=0;angle=20;find('angle').value=String(angle);example=exampleStages(angle);render();
});
find('angle').addEventListener('input',()=>{
  cancel();angle=Number(find('angle').value);position=0;example=exampleStages(angle);render();
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&motion&&!motion.paused){motion.paused=true;motion.lastTime=null;cancelAnimationFrame(animationFrame);render();}
});
reducedMotion.addEventListener('change',()=>{
  if(reducedMotion.matches&&motion){const end=motion.to;cancel();position=end;render();}
});
new ResizeObserver(draw).observe(svg);
render();
