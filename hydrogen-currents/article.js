/* The explorer uses the exact equatorial 2p |m|=1 density, not a fitted profile.
   u = s/a0; velocities are in units of hbar/(m_e a0).
   v_Sch = m/u; v_spin = spin*(1/2 - 1/u). */
(() => {
  if (window.renderMathInElement) {
    renderMathInElement(document.querySelector('.orbital-post'), {
      delimiters: [{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false}],
      throwOnError: false
    });
  }

  const ns = 'http://www.w3.org/2000/svg';
  const contours = document.getElementById('density-contours');
  const arrows = document.getElementById('current-arrows');
  const spinSelect = document.getElementById('spin-direction');
  const phaseSelect = document.getElementById('phase-winding');
  const explanation = document.getElementById('flow-explanation');
  const tracerLayer = document.getElementById('current-tracers');
  const playToggle = document.getElementById('flow-play-toggle');
  const speedControl = document.getElementById('flow-speed');
  const speedValue = document.getElementById('flow-speed-value');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let component = 'spin';
  let playing = !reducedMotion.matches;
  let inView = false;
  let animationFrame = null;
  let lastFrameTime = null;
  let playbackSpeed = Number(speedControl.value);
  // A common time scale preserves relative speeds across radii and components.
  const timeScale = 2;
  // Use the same analytic profile for the ring brightness and the graph.
  const gradient = document.getElementById('density-ring');
  gradient.replaceChildren();
  for (let i=0;i<=70;i++) {
    const u=i/10, density=u*u*Math.exp(2-u)/4;
    const color=[8,13,24].map((base,k)=>Math.round(base+density*([101,139,144][k]-base)));
    const stop=document.createElementNS(ns,'stop');
    stop.setAttribute('offset',`${i/70*100}%`);stop.setAttribute('stop-color',`rgb(${color.join(',')})`);gradient.append(stop);
  }
  document.querySelectorAll('#ring-view marker').forEach(marker=>{
    marker.setAttribute('markerWidth','4');marker.setAttribute('markerHeight','4');
    marker.setAttribute('refX','3.5');marker.setAttribute('refY','2');
    marker.querySelector('path').setAttribute('d','M0,0 L4,2 L0,4 Z');
  });
  const radii = [0.8, 1.4, 2.0, 2.8, 3.5, 4.0, 4.4, 5.5, 6.6];
  radii.forEach(u => {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx',200); circle.setAttribute('cy',172); circle.setAttribute('r',u*22);
    if (u === 2) { circle.setAttribute('stroke-opacity','.65'); circle.setAttribute('stroke-dasharray','3 4'); }
    contours.append(circle);
  });
  const profile = Array.from({length:181}, (_,i) => {
    const u = i*7/180, density = u*u*Math.exp(2-u)/4;
    return `${(42+u*368/7).toFixed(2)},${(216-density*177).toFixed(2)}`;
  });
  document.getElementById('profile-line').setAttribute('d','M'+profile.join(' L'));
  document.getElementById('profile-area').setAttribute('d','M42,216 L'+profile.join(' L')+' L410,216 Z');

  const tracerRings = radii.map(u => {
    const group = document.createElementNS(ns,'g');
    group.dataset.radius = u;
    group.setAttribute('transform','rotate(0 200 172)');
    tracerLayer.append(group);
    const count = Math.max(6,Math.round(u*3));
    const tracers = Array.from({length:count},(_,i) => {
      const angle = i*2*Math.PI/count+u*.19;
      const tail = document.createElementNS(ns,'path');
      const wake = document.createElementNS(ns,'path');
      for (const [path,opacity] of [[tail,.14],[wake,.48]]) {
        path.setAttribute('fill','none');path.setAttribute('stroke-width','1.6');
        path.setAttribute('stroke-linecap','round');path.setAttribute('opacity',opacity);
        group.append(path);
      }
      const dot = document.createElementNS(ns,'circle');
      dot.setAttribute('cx',200+u*22*Math.cos(angle));
      dot.setAttribute('cy',172-u*22*Math.sin(angle));
      dot.setAttribute('r','2.1');group.append(dot);
      return {angle,tail,wake,dot};
    });
    return {u,group,tracers,angle:0,omega:0};
  });

  function arc(u,start,end) {
    const r=u*22;
    return `M${200+r*Math.cos(start)},${172-r*Math.sin(start)} A${r},${r} 0 0 ${end>start?0:1} ${200+r*Math.cos(end)},${172-r*Math.sin(end)}`;
  }

  function animate(now) {
    const elapsed=lastFrameTime===null?0:(now-lastFrameTime)/1000;
    lastFrameTime=now;
    for (const ring of tracerRings) {
      ring.angle=(ring.angle+ring.omega*elapsed*timeScale*playbackSpeed)%(2*Math.PI);
      ring.group.setAttribute('transform',`rotate(${-ring.angle*180/Math.PI} 200 172)`);
    }
    animationFrame=requestAnimationFrame(animate);
  }

  function syncPlayback() {
    if (animationFrame!==null) cancelAnimationFrame(animationFrame);
    animationFrame=null;lastFrameTime=null;
    playToggle.textContent=playing?'Pause':'Play';
    playToggle.setAttribute('aria-pressed',String(playing));
    playToggle.setAttribute('aria-label',playing?'Pause current animation':'Play current animation');
    if (playing && inView && !document.hidden) animationFrame=requestAnimationFrame(animate);
  }

  function update() {
    const spin=Number(spinSelect.value), m=Number(phaseSelect.value);
    arrows.replaceChildren();
    for (const ring of tracerRings) {
      const u=ring.u;
      const phase=m/u, magnetization=spin*(0.5-1/u);
      const velocity=component==='spin'?magnetization:component==='phase'?phase:phase+magnetization;
      const stopped=Math.abs(velocity)<1e-8;
      const sign=stopped?0:Math.sign(velocity), color=stopped?'#d6e6eb':sign>0?'#ffb969':'#afa1ff';
      ring.omega=stopped?0:velocity/u;
      ring.group.dataset.direction=stopped?'stationary':sign>0?'ccw':'cw';
      for (const tracer of ring.tracers) {
        tracer.dot.setAttribute('fill',color);
        tracer.dot.setAttribute('opacity',stopped?'.7':'1');
        for (const path of [tracer.tail,tracer.wake]) {
          path.setAttribute('stroke',color);path.setAttribute('visibility',stopped?'hidden':'visible');
        }
        tracer.tail.setAttribute('d',arc(u,tracer.angle-ring.omega*.8,tracer.angle-ring.omega*.25));
        tracer.wake.setAttribute('d',arc(u,tracer.angle-ring.omega*.25,tracer.angle));
      }
      if (stopped) continue;
      for (let i=0;i<3;i++) {
        const center=i*2*Math.PI/3+u*.19;
        const angles=[center-sign*.22,center+sign*.22];
        const points=angles.map(a=>[200+u*22*Math.cos(a),172-u*22*Math.sin(a)]);
        const path=document.createElementNS(ns,'path');
        path.setAttribute('d',`M${points[0].join(',')} A${u*22},${u*22} 0 0 ${sign>0?0:1} ${points[1].join(',')}`);
        path.setAttribute('stroke',color); path.setAttribute('marker-end',`url(#arrow-${sign>0?'positive':'negative'})`);
        path.dataset.radius=u; path.dataset.direction=sign>0?'ccw':'cw';
        arrows.append(path);
      }
    }
    const spinText=spin>0?'+z':'−z';
    if (component==='spin') {
      explanation.textContent=`With spin ${spinText}, the spin current is ${spin>0?'clockwise':'counterclockwise'} inside the density maximum and ${spin>0?'counterclockwise':'clockwise'} outside it. It vanishes at s = 2a₀. Changing phase winding has no effect on this contribution.`;
    } else if (component==='phase') {
      explanation.textContent=`For mℓ = ${m>0?'+1':'−1'}, the Schrödinger current is ${m>0?'counterclockwise':'clockwise'} at every radius in this slice. Changing the spin does not change this contribution.`;
    } else if (m===spin) {
      explanation.textContent=`The two contributions add to ${m>0?'counterclockwise':'clockwise'} total flow at every radius. For this particular equatorial slice, vφ = ${spin>0?'':'−'}ℏ/(2mₑa₀). The spin contribution reverses at 2a₀, but the total does not.`;
    } else {
      explanation.textContent=`The total current is ${m>0?'counterclockwise':'clockwise'} inside s = 4a₀ and ${spin>0?'counterclockwise':'clockwise'} outside it. Cancellation shifts the reversal away from the density maximum at 2a₀.`;
    }
    document.querySelectorAll('[data-component]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.component===component)));
  }
  document.querySelectorAll('[data-component]').forEach(button=>button.addEventListener('click',()=>{component=button.dataset.component;update();}));
  spinSelect.addEventListener('change',update); phaseSelect.addEventListener('change',update); update();
  playToggle.addEventListener('click',()=>{playing=!playing;syncPlayback();});
  speedControl.addEventListener('input',()=>{
    playbackSpeed=Number(speedControl.value);speedValue.value=`${playbackSpeed}×`;
  });
  reducedMotion.addEventListener('change',event=>{if(event.matches){playing=false;syncPlayback();}});
  document.addEventListener('visibilitychange',syncPlayback);
  const flowObserver=new IntersectionObserver(entries=>{
    inView=entries.some(entry=>entry.isIntersecting);syncPlayback();
  });
  flowObserver.observe(document.getElementById('ring-view'));
  syncPlayback();

  // Keep reading quiet: no autoplay and only one film playing at a time.
  const videos=[...document.querySelectorAll('video')];
  videos.forEach(video=>video.addEventListener('play',()=>videos.forEach(other=>{if(other!==video)other.pause();})));
  const comments=document.querySelector('[data-comments]');
  if (comments && 'IntersectionObserver' in window) {
    const observer=new IntersectionObserver(entries=>{
      if (!entries.some(entry=>entry.isIntersecting)) return;
      const script=document.createElement('script');script.src='../comments.js';document.body.append(script);observer.disconnect();
    },{rootMargin:'200px'});
    observer.observe(comments);
  }
})();
