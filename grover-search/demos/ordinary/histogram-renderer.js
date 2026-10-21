// Signed amplitude columns straddle an open zero-plane grid. WebGL supplies
// perspective and depth testing; the visible 2D canvas composites crisp labels
// onto that render, so a recording includes exactly the same view.
export const DEFAULT_VIEW = Object.freeze({ yaw: .62, elevation: Math.PI / 6, zoom: 1 });
const FOV = 40 * Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const normalize = a => { const n = Math.hypot(...a); return a.map(v => v / n); };
export function columnCenter(q, side) { return [Math.floor(q / side) - (side - 1) / 2, 0, (side - 1) / 2 - q % side]; }
export function columnHeight(value, side) { return clamp(value, -1, 1) * side * .7; }
export function columnValues(amplitudes, view = 'real') {
  return Array.from({ length: amplitudes.length / 2 }, (_, q) => view === 'probability'
    ? amplitudes[2*q] ** 2 + amplitudes[2*q+1] ** 2
    : amplitudes[2*q + (view === 'imaginary' ? 1 : 0)]);
}
export function formatAmplitude(value) {
  return Math.abs(value) < .0005 ? '0.000' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(3)}`;
}

function multiply(a, b) {
  return Float32Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, col = Math.floor(i / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + a[4 * k + row] * b[4 * col + k], 0);
  });
}
export function cameraFor(view, width, height, side) {
  const { yaw, elevation, zoom } = view, aspect = width / height;
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [-Math.sin(yaw) * Math.sin(elevation), Math.cos(elevation), -Math.cos(yaw) * Math.sin(elevation)];
  const back = [Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation)];
  // At elevation 0 both eye and target are exactly on the amplitude-zero plane.
  const target = [0, 0, 0];
  const halfFov = Math.atan(Math.tan(FOV / 2) * Math.min(1, aspect));
  // Fit both halves of the signed ruler, including on a narrow phone viewport.
  const distance = side * (aspect < 1 ? 1.15 : 1.03) / Math.sin(halfFov) / zoom;
  const eye = target.map((v, i) => v + distance * back[i]);
  const viewMatrix = [right[0], up[0], back[0], 0, right[1], up[1], back[1], 0,
    right[2], up[2], back[2], 0, -dot(right, eye), -dot(up, eye), -dot(back, eye), 1];
  const f = 1 / Math.tan(FOV / 2), near = .1, far = 200;
  const projection = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1,
    0, 0, 2 * far * near / (near - far), 0];
  return { matrix: multiply(projection, viewMatrix), eye, right, up, back, width, height, f };
}
export function project(point, camera) {
  const v = [...point, 1], m = camera.matrix;
  const c = [0, 1, 2, 3].map(row => v.reduce((sum, n, col) => sum + m[4 * col + row] * n, 0));
  return { x: (c[0] / c[3] + 1) * camera.width / 2, y: (1 - c[1] / c[3]) * camera.height / 2,
    depth: c[2] / c[3], visible: c[3] > 0 && Math.abs(c[2]) <= c[3] };
}
export function screenRay(x, y, camera) {
  const dx = (2 * x - camera.width) / (camera.height * camera.f);
  const dy = (camera.height - 2 * y) / (camera.height * camera.f);
  return normalize(camera.right.map((v, i) => dx * v + dy * camera.up[i] - camera.back[i]));
}
export function rayBox(origin, direction, lo, hi) {
  let near = 0, far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(direction[i]) < 1e-12) { if (origin[i] < lo[i] || origin[i] > hi[i]) return Infinity; continue; }
    let a = (lo[i] - origin[i]) / direction[i], b = (hi[i] - origin[i]) / direction[i];
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a); far = Math.min(far, b);
    if (near > far) return Infinity;
  }
  return near;
}
export function phaseColor(phase) {
  const h = ((190 + phase * 180 / Math.PI) % 360 + 360) % 360 / 60;
  const c = .7 * .78, x = c * (1 - Math.abs(h % 2 - 1)), m = .65 - c / 2;
  const rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return rgb.map(v => v + m);
}

export class HistogramRenderer {
  constructor(canvas, { onChange = () => {}, onPick = () => {}, onHover = () => {}, onError = () => {} } = {}) {
    this.canvas = canvas; this.context = canvas.getContext('2d', { alpha: false });
    this.surface = document.createElement('canvas');
    this.gl = this.surface.getContext('webgl', { antialias: true, alpha: false });
    if (!this.context || !this.gl) throw new Error('This histogram needs a browser with WebGL enabled.');
    this.onChange = onChange; this.onPick = onPick; this.onHover = onHover;
    this.view = { ...DEFAULT_VIEW }; this.hover = -1; this.pointers = new Map();
    this.width = 1; this.height = 1; this.data = null; this.lost = false;
    this.setupGL(); this.installControls();
    this.surface.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.lost = true; onError('The graphics context was interrupted. Waiting for it to recover…');
    });
    this.surface.addEventListener('webglcontextrestored', () => { this.setupGL(); this.lost = false; onError(''); this.onChange(); });
  }
  setupGL() {
    const gl = this.gl;
    const shader = (type, source) => {
      const result = gl.createShader(type); gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
      return result;
    };
    const vs = shader(gl.VERTEX_SHADER, 'attribute vec3 position; attribute vec3 color; uniform mat4 matrix; varying vec3 tint; void main(){ gl_Position=matrix*vec4(position,1.0); tint=color; }');
    const fs = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec3 tint; uniform float opacity; void main(){ gl_FragColor=vec4(tint,opacity); }');
    this.program = gl.createProgram(); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vs); gl.deleteShader(fs);
    this.buffer = gl.createBuffer(); this.matrixUniform = gl.getUniformLocation(this.program, 'matrix');
    this.opacityUniform = gl.getUniformLocation(this.program, 'opacity');
    this.positionAttribute = gl.getAttribLocation(this.program, 'position'); this.colorAttribute = gl.getAttribLocation(this.program, 'color');
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }
  setView(next) {
    for (const key of ['yaw', 'elevation', 'zoom']) if (Number.isFinite(next[key])) this.view[key] = next[key];
    this.view.yaw = ((this.view.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    this.view.elevation = clamp(this.view.elevation, -85 * Math.PI / 180, 85 * Math.PI / 180);
    this.view.zoom = clamp(this.view.zoom, .6, 1.8);
    this.updateCamera(); this.onChange(); return { ...this.view };
  }
  resetView() { return this.setView(DEFAULT_VIEW); }
  orbit(dx, dy = 0) { return this.setView({ yaw: this.view.yaw + dx, elevation: this.view.elevation + dy }); }
  zoom(factor) { return this.setView({ zoom: this.view.zoom * factor }); }
  updateCamera() { this.camera = cameraFor(this.view, this.width, this.height, this.data?.side || 4); }
  resize() {
    const bounds = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width)), height = Math.max(1, Math.round(bounds.height));
    const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = this.surface.width = pw; this.canvas.height = this.surface.height = ph;
    }
    this.width = width; this.height = height; this.dpr = dpr; this.updateCamera();
  }
  draw(data, options = {}) {
    this.data = data; this.resize(); if (this.lost) return;
    const { side, probabilities: ps, amplitudes, initial, target, labels } = data;
    const values = this.values = columnValues(amplitudes, options.columnView);
    const isProbability = options.columnView === 'probability';
    const triangles = [], lines = [], half = side / 2;
    const vertex = (out, p, color) => out.push(...p, ...color);
    const quad = (points, color) => { for (const i of [0, 1, 2, 0, 2, 3]) vertex(triangles, points[i], color); };
    const line = (a, b, color) => { vertex(lines, a, color); vertex(lines, b, color); };
    const outline = (x, z, r, y, color) => {
      const points = [[x-r,y,z-r],[x+r,y,z-r],[x+r,y,z+r],[x-r,y,z+r]];
      for (let i = 0; i < 4; i++) line(points[i], points[(i+1)%4], color);
    };
    // No opaque board: amplitudes below zero must remain visible from above.
    outline(0, 0, half + .05, 0, [.25,.56,.70]);
    for (let q = 0; q < ps.length; q++) {
      const [x,,z] = columnCenter(q, side), r = .474;
      outline(x, z, r, 0, q === this.hover ? [.54,.84,.96] : [.17,.34,.46]);
      if (q === target) { outline(x,z,.435,0,[1,.30,.40]); outline(x,z,.415,0,[1,.30,.40]); }
      if (q === initial) outline(x,z,.39,0,[.26,.93,.49]);
      const h = columnHeight(values[q], side);
      if (Math.abs(h) < 1e-8) continue;
      const w = .31, y = 0;
      const c = options.phaseColors === false ? (h < 0 ? [.96,.40,.39] : [.36,.77,.90]) : phaseColor(Math.atan2(amplitudes[2*q+1], amplitudes[2*q]));
      const points = [[x-w,y,z-w],[x+w,y,z-w],[x+w,y,z+w],[x-w,y,z+w],
        [x-w,y+h,z-w],[x+w,y+h,z-w],[x+w,y+h,z+w],[x-w,y+h,z+w]];
      const faces = [[4,5,6,7,.98],[0,1,2,3,.82],[0,1,5,4,.59],[1,2,6,5,.72],[2,3,7,6,.83],[3,0,4,7,.65]];
      for (const face of faces) quad(face.slice(0,4).map(i => points[i]), c.map(v => v * face[4]));
      for (const [a,b] of [[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]) line(points[a], points[b], c.map(v => Math.min(1, v * 1.12)));
    }
    // Keep the signed ruler on the left silhouette of the grid at any yaw.
    const ax = (Math.cos(this.view.yaw) >= 0 ? -1 : 1) * (half + .22);
    const az = (Math.sin(this.view.yaw) >= 0 ? 1 : -1) * (half + .22);
    line([ax,columnHeight(isProbability ? 0 : -1,side),az],[ax,columnHeight(1,side),az],[.32,.43,.56]);
    this.renderGeometry(triangles, lines, this.meanGeometry(data.meanGuide, side));
    const ctx = this.context; ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.drawImage(this.surface,0,0,this.width,this.height);
    ctx.font = '10px "Segoe UI", sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const p of Math.abs(this.view.elevation) > 1.35 ? [] : isProbability ? [0,.25,.5,.75,1] : [-1,-.5,0,.5,1]) {
      const pos = project([ax,columnHeight(p,side),az],this.camera);
      ctx.strokeStyle = '#5a728b'; ctx.beginPath(); ctx.moveTo(pos.x-3,pos.y); ctx.lineTo(pos.x+3,pos.y); ctx.stroke();
      ctx.fillStyle = p === 0 ? '#a5e8ff' : '#91a6be';
      ctx.fillText(isProbability ? `${100*p}%` : p === 0 ? '0' : `${p > 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}`,pos.x-8,pos.y);
    }
    ctx.textAlign = 'center'; ctx.font = '10px Consolas, monospace';
    const frontZ = (Math.cos(this.view.yaw) >= 0 ? 1 : -1) * (half + .23);
    const frontX = (Math.sin(this.view.yaw) >= 0 ? 1 : -1) * (half + .23);
    for (let i = 0; i < side; i++) {
      const xp = project([i-(side-1)/2,0,frontZ],this.camera), yp = project([frontX,0,(side-1)/2-i],this.camera);
      ctx.fillStyle = '#91abc6'; ctx.fillText(`x=${i}`,xp.x,xp.y+12); ctx.fillText(`y=${i}`,yp.x,yp.y+12);
    }
    const occupied = this.drawMeanLabels(data.meanGuide, side, ax, az);
    const candidates = [];
    if (options.valueLabels !== false) for (let q = 0; q < ps.length; q++) {
      if (ps[q] < 1e-6 && q !== target && q !== initial) continue;
      const [x,,z] = columnCenter(q,side), h = columnHeight(values[q],side);
      const pos = project([x,h+(h < 0 ? -.05 : .05),z],this.camera);
      if (!pos.visible) continue;
      candidates.push({ q, pos, priority: q === this.hover ? 3 : q === target ? 2 : q === initial ? 1 : 0 });
    }
    candidates.sort((a,b) => b.priority-a.priority || a.pos.depth-b.pos.depth);
    for (const {q,pos} of candidates) {
      const text = isProbability ? `${(ps[q]*100).toFixed(1)}%` : formatAmplitude(values[q]);
      ctx.font = '11px "Segoe UI", sans-serif';
      const label = `|${labels[q]}⟩`, width = Math.max(ctx.measureText(text).width,ctx.measureText(label).width)+12;
      const rect = { x: pos.x-width/2, y: pos.y+(values[q] < -1e-8 ? 4 : -35), w: width, h: 32 };
      if (rect.x < 2 || rect.y < 2 || rect.x+rect.w > this.width-2 || rect.y+rect.h > this.height-2) continue;
      if (occupied.some(b => rect.x < b.x+b.w+3 && rect.x+rect.w+3 > b.x && rect.y < b.y+b.h+3 && rect.y+rect.h+3 > b.y)) continue;
      occupied.push(rect); ctx.fillStyle = '#0b1627dc'; ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      ctx.fillStyle = q === target ? '#ffbcc6' : '#e1eefb'; ctx.fillText(text,pos.x,rect.y+10);
      ctx.font = '9px Consolas, monospace'; ctx.fillStyle = q === target ? '#ed9eac' : '#9cb8d2'; ctx.fillText(label,pos.x,rect.y+24);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = '10px "Segoe UI", sans-serif'; ctx.fillStyle = '#91a8c0';
    ctx.fillText(isProbability ? 'HEIGHT |a|² · 0–100%' : `HEIGHT ${options.columnView === 'imaginary' ? 'Im(a)' : 'Re(a)'} · −1 to +1`,12,this.height-12);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffb4c2';
    ctx.fillText(`P(marked) ${(100*ps[target]).toFixed(2)}%`,this.width-12,this.height-12);
  }
  meanGeometry(guide, side) {
    const triangles = [], lines = [];
    if (!guide?.visible) return {triangles, lines};
    const gold = [1,.78,.35], violet = [.64,.73,1];
    const vertex = (out, point, color) => out.push(...point, ...color);
    const line = (a, b, color, dashed = false) => {
      const steps = dashed ? Math.max(2, Math.ceil(Math.hypot(...a.map((v,i) => v-b[i])) / .12)) : 1;
      for (let t = 0; t < steps; t += dashed ? 2 : 1) {
        vertex(lines, a.map((v,i) => v + (b[i]-v)*t/steps), color);
        vertex(lines, a.map((v,i) => v + (b[i]-v)*(t+1)/steps), color);
      }
    };
    const plane = (x, z, radius, value, output = false) => {
      const y = columnHeight(value, side), color = output ? violet : gold;
      const points = [[x-radius,y,z-radius],[x+radius,y,z-radius],[x+radius,y,z+radius],[x-radius,y,z+radius]];
      if (!output) for (const k of [0,1,2,0,2,3]) vertex(triangles, points[k], color);
      for (let k = 0; k < 4; k++) line(points[k], points[(k+1)%4], color, output);
      if (guide.uniform && !output) for (let k = 1; k < side; k++) {
        const v = k-side/2, h = side/2;
        line([-h,y,v],[h,y,v],gold.map(c => c*.6));
        line([v,y,-h],[v,y,h],gold.map(c => c*.6));
      }
    };
    if (guide.uniform) {
      plane(0,0,side/2+.08,guide.values[0]);
      if (guide.showResult && Math.abs(guide.values[0]-guide.outputValues[0])>1e-6) plane(0,0,side/2+.08,guide.outputValues[0],true);
    } else for (let q = 0; q < side*side; q++) {
      const [x,,z] = columnCenter(q,side);
      plane(x,z,.43,guide.values[q]);
      if (guide.showResult && Math.abs(guide.values[q]-guide.outputValues[q])>1e-6) plane(x,z,.43,guide.outputValues[q],true);
    }
    return {triangles, lines};
  }
  drawMeanLabels(guide, side, ax, az) {
    const occupied = [];
    if (!guide?.visible) return occupied;
    const ctx = this.context, gold = '#ffd783', violet = '#b2c7ff';
    const label = (value, x, y, color, align = 'left') => {
      ctx.font = '10px "Segoe UI", sans-serif';
      const width = ctx.measureText(value).width + 12;
      const rect = {x:clamp(align === 'right' ? x-width : x,4,this.width-width-4),y:clamp(y,40,this.height-42),w:width,h:21};
      ctx.fillStyle = '#061124e8'; ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
      ctx.fillText(value,rect.x+6,rect.y+10); occupied.push(rect);
    };
    if (guide.uniform) {
      const mean = guide.values[0], a = project([ax,columnHeight(mean,side),az],this.camera);
      label(`Mean μ ${formatAmplitude(mean)}`,a.x+7,a.y-24,gold);
      if (guide.showResult) {
        const input = guide.inputValues[0], output = guide.outputValues[0];
        if (Math.abs(mean-output)>1e-6) {
          const b = project([ax,columnHeight(output,side),az],this.camera);
          label(`Final −μ₀ ${formatAmplitude(output)}`,b.x+7,b.y+(Math.abs(a.y-b.y)<27?2:-10),violet);
        }
        // The plane follows the current amplitudes. The arrow retains the full
        // displacement from the mixer input mean μ₀ to the final mean −μ₀.
        const start = project([-ax,columnHeight(input,side),-az],this.camera);
        const end = project([-ax,columnHeight(output,side),-az],this.camera);
        if (Math.hypot(start.x-end.x,start.y-end.y)>15) {
          const angle = Math.atan2(end.y-start.y,end.x-start.x);
          ctx.strokeStyle = gold; ctx.lineWidth = 1.5; ctx.beginPath();
          ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);
          for (const turn of [-.5,.5]) {ctx.moveTo(end.x,end.y);ctx.lineTo(end.x-7*Math.cos(angle+turn),end.y-7*Math.sin(angle+turn));}
          ctx.stroke();ctx.lineWidth = 1;
          label(`Δ ${formatAmplitude(guide.shifts[0])}`,(start.x+end.x)/2-7,(start.y+end.y)/2-10,gold,'right');
        }
      }
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '10px "Segoe UI", sans-serif';
    ctx.fillStyle = gold;
    const caption = guide.uniform ? (guide.showResult ? 'FULL MIXER  a′ = a − 2μ₀' : 'MEAN AMPLITUDE  μ') : 'MIXER REFERENCE  pⱼ = sⱼ⟨s|a⟩';
    ctx.fillText(caption,12,48);
    occupied.push({x:8,y:38,w:ctx.measureText(caption).width+8,h:20});
    ctx.textAlign = 'center';
    return occupied;
  }
  renderGeometry(triangles, lines, guide) {
    const gl = this.gl; gl.viewport(0,0,this.surface.width,this.surface.height);
    gl.clearColor(.004,.027,.063,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program); gl.uniformMatrix4fv(this.matrixUniform,false,this.camera.matrix);
    gl.uniform1f(this.opacityUniform,1);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.enableVertexAttribArray(this.positionAttribute); gl.vertexAttribPointer(this.positionAttribute,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(this.colorAttribute); gl.vertexAttribPointer(this.colorAttribute,3,gl.FLOAT,false,24,12);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([...triangles,...lines]),gl.DYNAMIC_DRAW);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1,1);
    gl.drawArrays(gl.TRIANGLES,0,triangles.length/6); gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.drawArrays(gl.LINES,triangles.length/6,lines.length/6);
    if (guide.triangles.length || guide.lines.length) {
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([...guide.triangles,...guide.lines]),gl.DYNAMIC_DRAW);
      // Reference surfaces are translucent and do not intercept picking or
      // write depth, so columns on either side of zero remain visible.
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
      gl.uniform1f(this.opacityUniform,.09);
      gl.drawArrays(gl.TRIANGLES,0,guide.triangles.length/6);
      gl.uniform1f(this.opacityUniform,.9);
      gl.drawArrays(gl.LINES,guide.triangles.length/6,guide.lines.length/6);
      gl.depthMask(true);gl.disable(gl.BLEND);gl.uniform1f(this.opacityUniform,1);
    }
  }
  hitTest(x,y) {
    if (!this.data || !this.camera) return -1;
    const {side} = this.data, direction = screenRay(x,y,this.camera);
    let hit = -1, nearest = Infinity;
    for (let q = 0; q < side*side; q++) {
      const [cx,,cz] = columnCenter(q,side), h = columnHeight(this.values[q],side);
      const distance = Math.abs(h) > 1e-8 ? rayBox(this.camera.eye,direction,[cx-.31,Math.min(0,h),cz-.31],[cx+.31,Math.max(0,h),cz+.31]) : Infinity;
      if (distance < nearest) { nearest = distance; hit = q; }
    }
    // The grid is transparent: only fall back to its cells when no solid
    // column is hit, so a negative column can be picked through the zero plane.
    if (hit >= 0) return hit;
    for (let q = 0; q < side*side; q++) {
      const [cx,,cz] = columnCenter(q,side);
      const distance = rayBox(this.camera.eye,direction,[cx-.474,-.002,cz-.474],[cx+.474,.002,cz+.474]);
      if (distance < nearest) { nearest = distance; hit = q; }
    }
    return hit;
  }
  projectState(q, top = true) {
    if (!this.data || q < 0 || q >= this.data.side ** 2) return null;
    const p = columnCenter(q,this.data.side); if (top) p[1] = columnHeight(this.values[q],this.data.side);
    return project(p,this.camera);
  }
  installControls() {
    const canvas = this.canvas;
    const position = event => { const b = canvas.getBoundingClientRect(); return {x:event.clientX-b.left,y:event.clientY-b.top}; };
    const pinchDistance = () => { const [a,b] = [...this.pointers.values()]; return Math.hypot(a.x-b.x,a.y-b.y); };
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const p = position(event); this.pointers.set(event.pointerId,p);
      if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
      if (this.pointers.size === 1) { this.down = p; this.dragged = false; }
      else { this.dragged = true; this.pinch = pinchDistance(); }
    });
    canvas.addEventListener('pointermove', event => {
      const p = position(event), old = this.pointers.get(event.pointerId);
      if (old) {
        this.pointers.set(event.pointerId,p);
        if (this.pointers.size > 1) {
          const distance = pinchDistance(); if (this.pinch > 0) this.zoom(distance/this.pinch); this.pinch = distance;
        } else {
          if (Math.hypot(p.x-this.down.x,p.y-this.down.y) > 5) this.dragged = true;
          if (this.dragged) this.orbit(-(p.x-old.x)*.008,(p.y-old.y)*.006);
        }
      } else {
        const q = this.hitTest(p.x,p.y);
        if (q !== this.hover) { this.hover = q; this.onHover(q); this.onChange(); }
      }
    });
    const finish = (event,cancel = false) => {
      if (!this.pointers.has(event.pointerId)) return;
      const p = position(event), click = !cancel && !this.dragged && this.pointers.size === 1 && Math.hypot(p.x-this.down.x,p.y-this.down.y) <= 5;
      this.pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (click) { const q = this.hitTest(p.x,p.y); if (q >= 0) this.onPick(q); }
      if (this.pointers.size === 1) { this.down = [...this.pointers.values()][0]; this.dragged = true; }
    };
    canvas.addEventListener('pointerup',event => finish(event));
    canvas.addEventListener('pointercancel',event => finish(event,true));
    canvas.addEventListener('lostpointercapture',event => finish(event,true));
    canvas.addEventListener('pointerleave',() => { if (!this.pointers.size) { this.hover = -1; this.onHover(-1); this.onChange(); } });
    canvas.addEventListener('wheel',event => { event.preventDefault(); const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1; this.zoom(Math.exp(-event.deltaY*unit*.001)); },{passive:false});
    canvas.addEventListener('keydown',event => {
      const actions = {ArrowLeft:()=>this.orbit(-.12),ArrowRight:()=>this.orbit(.12),ArrowUp:()=>this.orbit(0,.10),ArrowDown:()=>this.orbit(0,-.10),
        '+':()=>this.zoom(1.1),'=':()=>this.zoom(1.1),'-':()=>this.zoom(1/1.1),Home:()=>this.resetView()};
      if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
    });
  }
}
