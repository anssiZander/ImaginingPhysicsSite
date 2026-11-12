'use strict';

if (window.renderMathInElement) {
  renderMathInElement(document.querySelector('article'), {
    delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
    throwOnError: false,
    strict: 'warn'
  });
}

const films = [document.getElementById('film-up'), document.getElementById('film-down')];
const PLAYBACK_RATE = 2;
const master = films[0];
const playButton = document.getElementById('play-pair');
const time = document.getElementById('film-time');
const clock = document.getElementById('film-clock');
const status = document.getElementById('film-status');
let running = false;
let animation = null;
let pending = false;
let generation = 0;
const format = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;

function updateControls() {
  const duration = Math.min(...films.map(f => Number.isFinite(f.duration) ? f.duration : 700 / 30));
  time.max = String(duration);
  time.value = String(master.currentTime);
  time.setAttribute('aria-valuetext', `${format(master.currentTime)} of ${format(duration)}`);
  clock.textContent = `${format(master.currentTime)} / ${format(duration)}`;
  playButton.textContent = running ? 'Pause both' : 'Play both';
  playButton.setAttribute('aria-pressed', String(running));
}
function stop() {
  generation++;
  running = false;
  pending = false;
  films.forEach(f => f.pause());
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
  playButton.disabled = false;
  updateControls();
}
function tick() {
  if (!running) return;
  if (Math.abs(films[1].currentTime - master.currentTime) > .12 && !films[1].seeking) {
    films[1].currentTime = master.currentTime;
  }
  updateControls();
  animation = requestAnimationFrame(tick);
}
async function play() {
  if (pending) return;
  pending = true;
  const token = ++generation;
  playButton.disabled = true;
  status.textContent = '';
  if (master.ended || master.currentTime >= Number(time.max) - .1) films.forEach(f => { f.currentTime = 0; });
  films[1].currentTime = master.currentTime;
  try {
    await Promise.all(films.map(f => f.play()));
    if (token !== generation) { films.forEach(f => f.pause()); return; }
    running = true;
    tick();
  } catch (error) {
    if (token === generation) {
      stop();
      status.textContent = 'The paired player could not start. You can open either film using the links below.';
    }
  } finally {
    if (token === generation) { pending = false; playButton.disabled = false; updateControls(); }
  }
}
playButton.addEventListener('click', () => running ? stop() : play());
document.getElementById('restart-pair').addEventListener('click', () => {
  stop(); films.forEach(f => { f.currentTime = 0; }); updateControls();
});
time.addEventListener('input', () => {
  const targetTime = Number(time.value);
  stop(); films.forEach(f => { f.currentTime = targetTime; }); updateControls();
});
films.forEach(f => {
  f.defaultPlaybackRate = PLAYBACK_RATE;
  f.playbackRate = PLAYBACK_RATE;
  f.addEventListener('loadedmetadata', updateControls);
  f.addEventListener('ended', stop);
  f.addEventListener('seeked', updateControls);
  f.addEventListener('error', () => { stop(); status.textContent = 'A film could not load. Try the direct video links below.'; });
  f.controls = false;
});
document.querySelector('.film-controls').hidden = false;
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
updateControls();
