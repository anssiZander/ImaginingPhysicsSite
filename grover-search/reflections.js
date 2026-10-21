import {checkpoint, sweep, START, THETA} from './reflection-core.js';

const root = document.getElementById('reflection-lab');
const find = suffix => document.getElementById(`reflection-${suffix}`);
const svg = find('svg'), drawing = find('drawing');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let step = 0, vector = checkpoint(0), transition = null, animationFrame;
const signed = value => `${value < -1e-9 ? '−' : '+'}${Math.abs(value).toFixed(4)}`;

function draw() {
  const width = Math.max(260, svg.getBoundingClientRect().width);
  const radius = Math.min(190, (width - 112) / 2);
  const height = 2 * radius + 100, cx = width / 2, cy = height / 2;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.height = `${height}px`;
  const point = (v, scale = 1) => ({x: cx + radius * scale * v.r, y: cy - radius * scale * v.w});
  const tip = point(vector), start = point(START, 1.13), opposite = point(START, -1.13);
  const displayedStep = transition ? step + 1 : step;
  const kind = displayedStep === 0 ? null : displayedStep % 2 ? 'oracle' : 'diffuser';
  const before = displayedStep ? checkpoint(displayedStep - 1) : null;
  const prior = before ? point(before) : null;
  const target = point(transition ? transition.to : vector);
  const psiLabel = {x: cx + .72 * (tip.x - cx) - 18 * vector.w,
    y: cy + .72 * (tip.y - cy) - 18 * vector.r};
  let roundArc = '';
  if (displayedStep > 0 && displayedStep % 2 === 0 && !transition) {
    const old = point(checkpoint(displayedStep - 2), .48);
    const end = point(vector, .48);
    roundArc = `<path class="vector-round-arc" d="M${old.x} ${old.y} A${radius*.48} ${radius*.48} 0 0 0 ${end.x} ${end.y}" marker-end="url(#vector-round-tip)" />`;
    const middle = (displayedStep - 1) * THETA + THETA;
    roundArc += `<text class="vector-angle" x="${cx + radius*.65*Math.cos(middle)}" y="${cy - radius*.65*Math.sin(middle)}" text-anchor="middle">2θ</text>`;
  }
  drawing.innerHTML = `
    <defs>
      <marker id="vector-current-tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#70e1df" /></marker>
      <marker id="vector-before-tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#9fadc4" /></marker>
      <marker id="vector-round-tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#c3a4ff" /></marker>
    </defs>
    <circle class="vector-circle" cx="${cx}" cy="${cy}" r="${radius}" />
    <path class="vector-axis" d="M${cx-radius-14} ${cy}H${cx+radius+14} M${cx} ${cy+radius+14}V${cy-radius-14}" />
    <path class="vector-mirror oracle-mirror ${kind==='oracle'?'is-active':''}" d="M${cx-radius-10} ${cy}H${cx+radius+10}" />
    <path class="vector-mirror diffuser-mirror ${kind==='diffuser'?'is-active':''}" d="M${opposite.x} ${opposite.y}L${start.x} ${start.y}" />
    ${before ? `<path class="vector-chord" d="M${prior.x} ${prior.y}L${target.x} ${target.y}" />
      <path class="vector-before" d="M${cx} ${cy}L${prior.x} ${prior.y}" marker-end="url(#vector-before-tip)" />` : ''}
    ${roundArc}
    <path class="vector-projection" d="M${tip.x} ${tip.y}H${cx}" />
    <path class="vector-current" d="M${cx} ${cy}L${tip.x} ${tip.y}" marker-end="url(#vector-current-tip)" />
    <circle class="vector-origin" cx="${cx}" cy="${cy}" r="3" />
    <circle id="reflection-current-tip" class="vector-tip" cx="${tip.x}" cy="${tip.y}" r="3" />
    <text class="vector-label" x="${cx+radius+22}" y="${cy+22}" text-anchor="middle">|r⟩</text>
    <text class="vector-label" x="${cx+12}" y="${cy-radius-22}">|w⟩</text>
    <text class="vector-label vector-s-label" x="${start.x+2}" y="${start.y-12}" text-anchor="middle">|s⟩</text>
    <text class="vector-label" x="${psiLabel.x}" y="${psiLabel.y}" text-anchor="middle">|ψ⟩</text>
    ${step === 0 && !transition ? `<path class="vector-round-arc" d="M${cx+radius*.44} ${cy} A${radius*.44} ${radius*.44} 0 0 0 ${cx+radius*.44*START.r} ${cy-radius*.44*START.w}" />
      <text class="vector-angle" x="${cx+radius*.55}" y="${cy-radius*.08}">θ</text>` : ''}
    <text class="vector-axis-note" x="${cx}" y="${height-12}" text-anchor="middle">Horizontal: unmarked sum · Vertical: marked</text>`;
  root.dataset.r = String(vector.r);
  root.dataset.w = String(vector.w);
  root.dataset.radius = String(radius);
  root.dataset.cx = String(cx);
  root.dataset.cy = String(cy);
}

function update() {
  const round = Math.ceil(step / 2);
  const gate = step % 2 ? 'Oracle' : 'Diffuser';
  const status = step ? `${gate} · round ${round}` : 'Start · equal superposition';
  find('status').textContent = transition
    ? `Reflecting across ${step % 2 ? '|s⟩' : '|r⟩'}…` : status;
  find('explanation').textContent = step === 0
    ? 'The starting arrow is θ ≈ 14.48° above the unmarked direction. Apply the oracle to begin.'
    : step % 2
      ? 'The oracle reverses the marked component across the horizontal mirror. Its squared magnitude—and the marked probability—stays the same.'
      : step === 6
        ? 'Three pairs reach 7θ ≈ 101.34°, just past the marked axis. This is the first recommended stop. Another round will lower the probability.'
        : step > 6
          ? 'Each pair still adds 2θ. Reversible rotation carries the arrow past the first peak; the marked probability oscillates.'
          : 'The diffuser mirrors the arrow across |s⟩. Together with the oracle, this advances the state by 2θ. The violet arc shows that whole-round advance.';
  // Readouts describe exact endpoints, even while a geometric sweep is drawn.
  const exact = checkpoint(step);
  find('probability').textContent = `${(100 * exact.w ** 2).toFixed(2)}%`;
  find('unmarked').textContent = signed(exact.r);
  find('marked').textContent = signed(exact.w);
  find('stop').classList.toggle('is-reached', step >= 6);
  find('stop').textContent = step >= 6 ? 'First recommended stop reached' : 'First recommended stop: 3 rounds';
  find('back').disabled = step === 0 && !transition;
  find('reset').disabled = step === 0 && !transition;
  find('next').disabled = !!transition;
  find('next').innerHTML = transition ? 'Reflecting…' : step % 2 ? 'Apply diffuser D' : 'Apply oracle O<sub>w</sub>';
  find('svg-description').textContent = `${status}. In the orthonormal unmarked–marked basis, the state has coordinates ${signed(exact.r)} and ${signed(exact.w)}. Marked probability ${(100*exact.w**2).toFixed(2)} percent. The oracle mirror is horizontal; the diffuser mirror is the initial direction, 14.48 degrees above it.`;
  root.dataset.step = String(step);
  root.dataset.busy = String(!!transition);
  root.dataset.ready = 'true';
  draw();
}

function cancel() {
  cancelAnimationFrame(animationFrame);
  transition = null;
  vector = checkpoint(step);
}

function finish() {
  if (!transition) return;
  step++;
  cancel();
  update();
}

function animate(time) {
  if (!transition) return;
  const progress = Math.min(1, (time - transition.start) / 700);
  const smooth = progress * progress * (3 - 2 * progress);
  vector = sweep(transition.from, transition.to, smooth);
  draw();
  if (progress === 1) finish();
  else animationFrame = requestAnimationFrame(animate);
}

find('next').addEventListener('click', () => {
  if (transition) return;
  transition = {from: checkpoint(step), to: checkpoint(step + 1), start: performance.now()};
  if (reducedMotion.matches) finish();
  else { update(); animationFrame = requestAnimationFrame(animate); }
});
find('back').addEventListener('click', () => {
  if (transition) cancel();
  else { step = Math.max(0, step - 1); vector = checkpoint(step); }
  update();
});
find('reset').addEventListener('click', () => { step = 0; cancel(); update(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) finish(); });
new ResizeObserver(draw).observe(svg);
update();
