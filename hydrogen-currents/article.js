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
  let component = 'spin';
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
  const radii = [0.8, 1.4, 2.0, 2.8, 3.5, 4.4, 5.5, 6.6];
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

  function update() {
    const spin=Number(spinSelect.value), m=Number(phaseSelect.value);
    arrows.replaceChildren();
    for (const u of radii) {
      const phase=m/u, magnetization=spin*(0.5-1/u);
      const velocity=component==='spin'?magnetization:component==='phase'?phase:phase+magnetization;
      if (Math.abs(velocity)<1e-8) continue;
      const sign=Math.sign(velocity), color=sign>0?'#ffb969':'#afa1ff';
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
