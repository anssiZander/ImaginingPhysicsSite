const byId = id => document.getElementById(id);

// Preserve incoming links to the sections moved into the standalone refresher.
const movedSections = new Set(['problem', 'reflections', 'preparation', 'columns',
  'global-phase', 'build-reflection', 'reflection-lab', 'construction-lab', 'column-lab']);
function redirectMovedSection() {
  if (/\/grover-search\/(?:index\.html)?$/.test(location.pathname) && movedSections.has(location.hash.slice(1))) {
    location.replace(new URL(`../grovers-algorithm/${location.hash}`, import.meta.url));
  }
}
addEventListener('hashchange', redirectMovedSection);
redirectMovedSection();

// Only one full demo iframe is alive at a time. Keep the independent branch
// implementations intact, including their own shader/import release suffixes.
const demos = {
  ordinary:{title:'Ordinary columns', description:'Signed amplitudes, orbit controls, separate or combined mixer, and steps beyond the first peak.'},
  'wave-hadamard':{title:'Controlled wave', description:'Sixteen packet modes with ideal Hadamard mixing and the chosen curl-free probability transport.'},
  'free-box':{title:'Free box', description:'Exact free-box mixing, a forward wait for the inverse, and Schrödinger probability current during free intervals.'},
  spin:{title:'Free box + spin', description:'Thirty-two joint modes, uniform spin rotation, and the total position current including spin circulation.'}
};
let selectedDemo;
function loadDemo(key) {
  if (!demos[key] || key === selectedDemo) return;
  selectedDemo = key;
  const data = demos[key], src = new URL(`demos/${key}/index.html?v=20261021-guided`, import.meta.url).href;
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = `${data.title} — full interactive Grover simulation`;
  iframe.allow = 'fullscreen';
  byId('demo-host').replaceChildren(iframe);
  byId('demo-description').textContent = data.description;
  byId('demo-fullscreen').href = src;
  byId('demo-fullscreen').textContent = `Open ${data.title.toLowerCase()} in a full page ↗`;
  document.querySelectorAll('[data-load-demo]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.loadDemo === key)));
}
document.querySelectorAll('[data-load-demo]').forEach(button => button.addEventListener('click', () => loadDemo(button.dataset.loadDemo)));
document.querySelectorAll('[data-demo]').forEach(link => link.addEventListener('click', () => loadDemo(link.dataset.demo)));

// Match other posts' comment widget, loading it only near the end of the read.
const comments = document.querySelector('[data-comments]');
new IntersectionObserver((entries, observer) => {
  if (!entries[0].isIntersecting) return;
  const script = document.createElement('script'); script.src = '../comments.js';
  document.body.append(script); observer.disconnect();
}, {rootMargin:'300px'}).observe(comments);
