import { CONFIG } from './config.js';
import { drawDeviationConstruction, drawDeviationStrip } from './deviation-construction-renderer.js';
import { createAreaMask } from './area.js';
import { arrowAxialDimensions, createArrowVertices } from './arrow-mesh.js';
import { deviationConstructionFocus, tidalCameraEye } from './camera.js';
import { createParticleSphere } from './particle-mesh.js';
import { tidalGridMotion, tidalToWorld } from './tidal.js';
import { drawGeodesicConstruction } from './geodesic-renderer.js';
import { clipMapSegment, polarScreenPoint, sphereMapDirection } from './sphere-map.js';
import { TAU, add, cross, dot, frame, lookAt, multiply, normalize, perspective, project, projectSegment, projectVisible, radians, rgb, scale, tangentVector, wrapPi } from './math.js';

const shaderFiles = ['surface.vert.glsl', 'surface.frag.glsl', 'map.vert.glsl', 'map.frag.glsl', 'polar-map.vert.glsl', 'polar-map.frag.glsl', 'overlay.vert.glsl', 'overlay.frag.glsl', 'arrow.vert.glsl', 'arrow.frag.glsl', 'particles.vert.glsl', 'particles.frag.glsl', 'tidal-grid.vert.glsl', 'tidal-grid.frag.glsl'];

async function readShaders() {
  const sources = await Promise.all(shaderFiles.map(async (file) => {
    const response = await fetch(new URL(`../shaders/${file}`, import.meta.url));
    if (!response.ok) throw new Error(`Could not load shaders/${file} (${response.status}).`);
    return [file, await response.text()];
  }));
  return Object.fromEntries(sources);
}

function program(gl, sources, name) {
  const shaders = ['vert', 'frag'].map((stage) => {
    const shader = gl.createShader(stage === 'vert' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER);
    gl.shaderSource(shader, sources[`${name}.${stage}.glsl`]);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`${name}.${stage}.glsl: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  });
  const result = gl.createProgram();
  shaders.forEach((shader) => gl.attachShader(result, shader));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(result)}`);
  shaders.forEach((shader) => gl.deleteShader(shader));
  return { handle: result, uniforms: new Map() };
}

function uniform(gl, p, name) {
  if (!p.uniforms.has(name)) p.uniforms.set(name, gl.getUniformLocation(p.handle, name));
  return p.uniforms.get(name);
}

class View {
  constructor(canvas, sources, backgroundProgram) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: true, antialias: true, depth: true, premultipliedAlpha: false });
    if (!this.gl) throw new Error('WebGL2 is unavailable. Enable hardware acceleration in a current desktop browser.');
    const gl = this.gl;
    this.background = program(gl, sources, backgroundProgram);
    this.overlay = program(gl, sources, 'overlay');
    this.areaTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.areaTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.emptyVAO = gl.createVertexArray();
    this.overlayVAO = gl.createVertexArray();
    this.overlayBuffer = gl.createBuffer();
    gl.bindVertexArray(this.overlayVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.ratio = Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);
    const w = Math.round(this.width * this.ratio), h = Math.round(this.height * this.ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }
  start(depth) {
    const gl = this.gl;
    // Browser zoom / moving between monitors can change DPR without changing CSS size.
    if (this.ratio !== Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio)) this.resize();
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    if (depth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); }
    else gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.background.handle);
  }
  gridUniforms(grid = CONFIG.grid) {
    const gl = this.gl, p = this.background;
    gl.uniform2f(uniform(gl, p, 'uGridStep'), radians(grid.minorStepDeg), radians(grid.majorStepDeg));
    gl.uniform3f(uniform(gl, p, 'uGridWidth'), grid.minorWidthPx * this.ratio, grid.majorWidthPx * this.ratio, grid.equatorWidthPx * this.ratio);
  }
  color(name, value) { this.gl.uniform3fv(uniform(this.gl, this.background, name), rgb(value)); }
  surfaceUniforms(surface) {
    const gl = this.gl, p = this.background;
    gl.uniform1i(uniform(gl, p, 'uTorus'), surface.isTorus ? 1 : 0);
    gl.uniform2f(uniform(gl, p, 'uRadii'), surface.R, surface.r);
    gl.bindTexture(gl.TEXTURE_2D, this.areaTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, surface.isTorus ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  }
  uploadArea(data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.areaTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, CONFIG.area.maskWidth, CONFIG.area.maskHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
  areaUniforms(enabled, opacity) {
    const gl = this.gl, p = this.background;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.areaTexture);
    gl.uniform1i(uniform(gl, p, 'uAreaMask'), 0);
    gl.uniform1f(uniform(gl, p, 'uAreaOpacity'), enabled ? opacity : 0);
    this.color('uAreaPositive', CONFIG.colors.areaPositive);
    this.color('uAreaNegative', CONFIG.colors.areaNegative);
  }
  drawBatch(batch) {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(this.overlay.handle);
    gl.bindVertexArray(this.overlayVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.overlayBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(batch.vertices), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, batch.vertices.length / 7);
    gl.bindVertexArray(null);
  }
}

class SolidArrow {
  constructor(gl, sources, geometry = CONFIG.geometry) {
    this.gl = gl;
    this.geometry = geometry;
    this.program = program(gl, sources, 'arrow');
    const vertices = createArrowVertices(geometry);
    this.count = vertices.length / 6;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    for (let i = 0; i < 2; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 24, i * 12);
    }
    gl.bindVertexArray(null);
  }
  draw(origin, vector, normal, size, color, matrix, eye, shape = [1, 1, 1], depthTest = true, headLength = null) {
    const gl = this.gl, p = this.program;
    gl.useProgram(p.handle);
    if (depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(color[3] >= 0.99);
    gl.uniformMatrix4fv(uniform(gl, p, 'uViewProjection'), false, matrix);
    gl.uniformMatrix3fv(uniform(gl, p, 'uBasis'), false, new Float32Array([...vector, ...normalize(cross(normal, vector)), ...normal]));
    gl.uniform3fv(uniform(gl, p, 'uOrigin'), origin);
    gl.uniform3fv(uniform(gl, p, 'uEye'), eye);
    gl.uniform3fv(uniform(gl, p, 'uLight'), CONFIG.render.lightDirection);
    gl.uniform4fv(uniform(gl, p, 'uColor'), color);
    gl.uniform1f(uniform(gl, p, 'uScale'), size * CONFIG.geometry.sphereRadius);
    gl.uniform3fv(uniform(gl, p, 'uShape'), shape);
    gl.uniform4fv(uniform(gl, p, 'uAxial'), arrowAxialDimensions(this.geometry, shape[0], headLength));
    gl.uniform4f(uniform(gl, p, 'uMaterial'), this.geometry.arrowAmbient ?? CONFIG.render.arrowAmbient, CONFIG.render.arrowDiffuse, CONFIG.render.arrowSpecular, CONFIG.render.arrowShininess);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.CULL_FACE);
  }
}

class TidalBackgroundGrid {
  constructor(gl, sources) {
    this.gl = gl;
    this.program = program(gl, sources, 'tidal-grid');
    this.vao = gl.createVertexArray();
  }
  draw(view, motion, pixelsPerUnit, visible) {
    const gl = this.gl, p = this.program, c = CONFIG.tidal.backgroundGrid;
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.useProgram(p.handle);
    gl.uniform2f(uniform(gl, p, 'uViewport'), view.canvas.width, view.canvas.height);
    gl.uniform1f(uniform(gl, p, 'uPixelsPerUnit'), pixelsPerUnit * view.ratio);
    gl.uniform1f(uniform(gl, p, 'uRadius'), motion.radius);
    gl.uniform1f(uniform(gl, p, 'uInitialRadius'), motion.initialRadius);
    gl.uniform2f(uniform(gl, p, 'uSpacing'), c.spacing, c.spacing * c.majorEvery);
    gl.uniform2f(uniform(gl, p, 'uWidths'), c.minorWidthPx * view.ratio, c.majorWidthPx * view.ratio);
    gl.uniform2f(uniform(gl, p, 'uOpacity'), visible ? c.minorOpacity : 0, visible ? c.majorOpacity : 0);
    gl.uniform3fv(uniform(gl, p, 'uColor'), rgb(c.color));
    gl.uniform3fv(uniform(gl, p, 'uBackgroundCenter'), rgb(c.backgroundCenter));
    gl.uniform3fv(uniform(gl, p, 'uBackgroundEdge'), rgb(c.backgroundEdge));
    gl.uniform1f(uniform(gl, p, 'uEdgeOpacity'), c.edgeOpacity);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

class ParticleShells {
  constructor(gl, sources) {
    this.gl = gl;
    this.program = program(gl, sources, 'particles');
    const c = CONFIG.tidal, mesh = createParticleSphere(c.particleLongitudeSegments, c.particleLatitudeSegments);
    this.count = mesh.indices.length;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.instances = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    for (const [location, size, offset] of [[1, 4, 0], [2, 3, 16]]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 28, offset);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
  }
  draw(model, matrix, eye) {
    const gl = this.gl, p = this.program, c = CONFIG.tidal;
    if (this.model !== model) {
      const instances = [];
      model.shells.forEach((shell, index) => {
        shell.directions.forEach((direction, i) => {
          const size = Math.max(c.minParticleRadius, shell.radius * c.particleRadius) * (i < 6 ? c.axisParticleScale : 1);
          const color = rgb(i < 6 ? c.axisColors[Math.floor(i / 2)] : c.shellColors[index]);
          instances.push(...scale(direction, shell.radius), size, ...color);
        });
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instances), gl.STATIC_DRAW);
      this.model = model;
    }
    gl.useProgram(p.handle);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.uniformMatrix4fv(uniform(gl, p, 'uViewProjection'), false, matrix);
    gl.uniform3fv(uniform(gl, p, 'uStretch'), model.scales);
    gl.uniformMatrix3fv(uniform(gl, p, 'uPrincipalBasis'), false, CONFIG.tidal.principalDirections.flat());
    gl.uniform1f(uniform(gl, p, 'uWorldScale'), CONFIG.geometry.sphereRadius);
    gl.uniform3fv(uniform(gl, p, 'uEye'), eye);
    gl.uniform3fv(uniform(gl, p, 'uLight'), c.lightDirection);
    gl.uniform4f(uniform(gl, p, 'uMaterial'), c.ambientLight, c.diffuseLight, c.specularLight, c.shininess);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0, model.particleCount);
    gl.bindVertexArray(null);
    gl.disable(gl.CULL_FACE);
  }
}

// Overlay triangles use CSS pixel x/y plus actual projected depth. Their depth
// is tested against the sphere, so back-side paths and arrows are occluded.
class Batch {
  constructor(width, height) { this.width = width; this.height = height; this.vertices = []; }
  vertex(p, color) { this.vertices.push(p[0] / this.width * 2 - 1, 1 - p[1] / this.height * 2, p[2], ...color); }
  triangle(a, b, c, color) { this.vertex(a, color); this.vertex(b, color); this.vertex(c, color); }
  line(a, b, width, color) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1e-6) return;
    const x = -dy / length * width / 2, y = dx / length * width / 2;
    const p = [a[0] + x, a[1] + y, a[2]], q = [a[0] - x, a[1] - y, a[2]];
    const r = [b[0] + x, b[1] + y, b[2]], s = [b[0] - x, b[1] - y, b[2]];
    this.triangle(p, q, r, color); this.triangle(q, s, r, color);
  }
  disk(center, radius, color, segments = 24) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * TAU, b = (i + 1) / segments * TAU;
      this.triangle(center, [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, center[2]], [center[0] + Math.cos(b) * radius, center[1] + Math.sin(b) * radius, center[2]], color);
    }
  }
  ring(center, radius, width, color, segments = 32) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * TAU, b = (i + 1) / segments * TAU;
      this.line([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, center[2]], [center[0] + Math.cos(b) * radius, center[1] + Math.sin(b) * radius, center[2]], width, color);
    }
  }
}

function surfaceMesh(gl, torus, detail = null) {
  const positions = [], indices = [], nx = detail?.longitudeSegments ?? (torus ? CONFIG.surface.torus.longitudeSegments : CONFIG.geometry.sphereLongitudeSegments);
  const ny = detail?.latitudeSegments ?? (torus ? CONFIG.surface.torus.tubeSegments : CONFIG.geometry.sphereLatitudeSegments), height = torus ? TAU : Math.PI;
  for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) positions.push(x / nx * TAU, -height / 2 + y / ny * height);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const a = y * (nx + 1) + x, b = a + nx + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: indices.length };
}

export class Renderer {
  static async create(sphereCanvas, mapCanvas) {
    const sources = await readShaders();
    return new Renderer(sphereCanvas, mapCanvas, sources);
  }
  constructor(sphereCanvas, mapCanvas, sources) {
    this.sphere = new View(sphereCanvas, sources, 'surface');
    this.map = new View(mapCanvas, sources, 'map');
    this.coordinateMapProgram = this.map.background;
    this.polarMapProgram = program(this.map.gl, sources, 'polar-map');
    this.meshes = { sphere: surfaceMesh(this.sphere.gl, false), torus: surfaceMesh(this.sphere.gl, true) };
    this.closeMeshes = {};
    this.arrow = new SolidArrow(this.sphere.gl, sources);
    this.constructionArrow = new SolidArrow(this.sphere.gl, sources, { ...CONFIG.geometry, arrowLength: 1, arrowShaftWidth: CONFIG.geodesic.arrowShaftWidth, arrowHeadWidth: CONFIG.geodesic.arrowHeadWidth, arrowHeadFraction: CONFIG.geodesic.arrowHeadFraction, arrowAmbient: CONFIG.geodesic.arrowAmbient });
    this.particles = new ParticleShells(this.sphere.gl, sources);
    this.tidalGrid = new TidalBackgroundGrid(this.sphere.gl, sources);
    this.tidalArrow = new SolidArrow(this.sphere.gl, sources, { ...CONFIG.geometry, arrowLength: 1, arrowShaftWidth: CONFIG.tidal.axisShaftWidth, arrowHeadWidth: CONFIG.tidal.axisHeadWidth, arrowHeadFraction: CONFIG.tidal.axisHeadFraction });
    this.closedRegion = null;
    this.angleLabel = null;
    this.principalLabels = [];
    this.deviationLabels = [];
    this.palette = Object.fromEntries(Object.entries(CONFIG.colors).map(([key, value]) => [key, rgb(value)]));
    this.frames = 0;
  }
  rgba(key, opacity = 1) { return [...this.palette[key], opacity]; }
  world(point, offset = CONFIG.geometry.pathSurfaceOffset) { return scale(this.surface.position(point.latitude, point.longitude, offset), CONFIG.geometry.sphereRadius); }
  signedColor(value) { return Math.abs(value) < CONFIG.curvature.zeroTolerance ? 'curvatureZero' : value < 0 ? 'areaNegative' : 'areaPositive'; }
  visible(point) { return this.surface.visible(scale(point, 1 / CONFIG.geometry.sphereRadius), scale(this.eye, 1 / CONFIG.geometry.sphereRadius)); }

  draw(model, camera, options) {
    this.isTidal = !!model.isTidal;
    this.isGeodesic = !!model.isGeodesic;
    if (this.isTidal) { this.drawTidal(model, camera, options); this.frames++; return; }
    this.surface = model.surface;
    const region = model.isDeviation || model.isGeodesic ? null : model.closedRegion;
    if (region?.boundsArea && region !== this.closedRegion) {
      const mask = createAreaMask(region, CONFIG.area.maskWidth, CONFIG.area.maskHeight, CONFIG.area.antialiasRows);
      this.sphere.uploadArea(mask);
      this.map.uploadArea(mask);
    }
    this.closedRegion = region;
    this.drawSphere(model, camera, options);
    if (!model.isDeviation && !model.isGeodesic) this.drawMap(model, options);
    this.frames++;
  }

  drawTidal(model, camera, options) {
    const view = this.sphere, c = CONFIG.tidal, radius = CONFIG.geometry.sphereRadius;
    this.firstPerson = false; this.topView = false; this.cameraPose = null; this.closedRegion = null;
    this.angleLabel = null; this.principalLabels = []; this.deviationLabels = [];
    const aspect = view.width / view.height;
    const fov = radians(c.camera.fieldOfViewDeg);
    const eye = tidalCameraEye(camera, aspect, radius);
    const matrix = multiply(perspective(fov, aspect, CONFIG.camera.near * radius, CONFIG.camera.far * radius), lookAt(eye));
    this.eye = eye; this.matrix = matrix;
    view.start(true);
    const gridMotion = tidalGridMotion(model.time, model.config.tidal);
    const pixelsPerUnit = view.height / (2 * Math.tan(fov / 2) * Math.hypot(...eye) / radius);
    this.tidalGrid.draw(view, gridMotion, pixelsPerUnit, options.tidalGrid);
    this.particles.draw(model, matrix, eye);
    const batch = new Batch(view.width, view.height), stretches = model.scales;
    const line = (a, b, width, color) => {
      const segment = projectSegment(a, b, matrix, view.width, view.height);
      if (segment) batch.line(...segment, width, color);
    };
    const circle = (shellRadius, plane, factors, color, dashed = false) => {
      const at = t => {
        const point = [0, 0, 0];
        point[plane[0]] = Math.cos(t) * shellRadius * factors[plane[0]] * radius;
        point[plane[1]] = Math.sin(t) * shellRadius * factors[plane[1]] * radius;
        return tidalToWorld(point);
      };
      for (let i = 0; i < c.guideSegments; i++) {
        if (!dashed || i % 4 < 2) line(at(i * TAU / c.guideSegments), at((i + 1) * TAU / c.guideSegments), c.guideWidthPx, color);
      }
    };
    for (const plane of [[0, 1], [0, 2], [1, 2]]) {
      if (model.time > 0) circle(model.shells[0].radius, plane, [1, 1, 1], [...rgb(c.shellColors[0]), c.initialOutlineOpacity], true);
      for (let i = 0; i < model.shellCount; i++) circle(model.shells[i].radius, plane, stretches, [...rgb(c.shellColors[i]), c.guideOpacity]);
    }
    const center = projectVisible([0, 0, 0], matrix, view.width, view.height);
    if (center) batch.disk(center, c.referenceRadiusPx, [0.95, 0.98, 1, 1]);
    view.drawBatch(batch);
    const axisLengths = stretches.map(s => s * model.shells[0].radius);
    for (let i = 0; i < 3; i++) {
      const color = rgb(c.axisColors[i]), normal = c.principalDirections[(i + 1) % 3];
      for (const sign of [-1, 1]) {
        const direction = scale(c.principalDirections[i], sign);
        this.tidalArrow.draw([0, 0, 0], direction, normal, 1, [...color, sign > 0 ? 1 : 0.45], matrix, eye, [axisLengths[i], 1, 1]);
      }
      const tip = [0, 0, 0]; tip[i] = (axisLengths[i] + c.axisLabelOffset) * radius;
      const screen = projectVisible(tidalToWorld(tip), matrix, view.width, view.height);
      this.deviationLabels.push({ x: screen?.[0] ?? 0, y: screen?.[1] ?? 0, visible: !!screen, color: c.axisColors[i], text: ['ξ₁', 'ξ₂', 'ξ₃'][i] });
    }
    this.tidalView = { particles: model.particleCount, spheres: true, trianglesPerParticle: this.particles.count / 3, axisLengths, axisDirections: c.principalDirections, eye, grid: { visible: options.tidalGrid, ...gridMotion, pixelsPerUnit } };
  }

  drawSphere(model, camera, options) {
    const view = this.sphere, gl = view.gl, p = view.background, radius = CONFIG.geometry.sphereRadius;
    this.topView = !!camera.isTopView;
    this.firstPerson = !camera.isTopView && !!(model.isGeodesic ? options.geodesicFirstPerson : model.isDeviation && options.firstPerson);
    const settings = camera.isTopView ? CONFIG.topView : this.firstPerson ? { ...CONFIG.firstPerson, ...(model.isGeodesic ? CONFIG.geodesic.firstPerson : {}) } : CONFIG.camera;
    const building = model.isDeviation && model.construction?.enabled;
    this.cameraPose = camera.isTopView ? camera.pose(model, radius) : this.firstPerson ? camera.pose(this.surface, model.isGeodesic ? model.currentPoint : model.particles[1], radius) : null;
    if (building && !this.cameraPose) {
      const orbitEye = camera.eye(radius), forward = normalize(scale(orbitEye, -1));
      const focus = scale(deviationConstructionFocus(model, camera.distance, camera.config), radius);
      // Pan the outside camera without changing its orbit orientation or depth.
      const target = add(focus, scale(forward, -dot(focus, forward))), eye = add(orbitEye, target);
      this.cameraPose = { eye, target, forward, up: [0, 1, 0], distance: camera.distance, view: lookAt(eye, target) };
    }
    const eye = this.cameraPose?.eye ?? camera.eye(radius);
    const aspect = view.width / view.height;
    const constructionZoom = building ? model.construction.config.defaultZoom : 1;
    const fov = 2 * Math.atan(Math.tan(radians(settings.fieldOfViewDeg) / 2) / (constructionZoom * (!this.firstPerson && CONFIG.camera.fitNarrowViews ? Math.min(1, aspect) : 1)));
    const matrix = multiply(perspective(fov, aspect, settings.near * radius, settings.far * radius), this.cameraPose?.view ?? lookAt(eye));
    this.matrix = matrix;
    this.eye = eye;
    const toScreen = (v) => project(v, matrix, view.width, view.height);
    view.start(true);
    view.surfaceUniforms(this.surface);
    gl.uniformMatrix4fv(uniform(gl, p, 'uViewProjection'), false, matrix);
    gl.uniform1f(uniform(gl, p, 'uRadius'), radius);
    gl.uniform3fv(uniform(gl, p, 'uEye'), eye);
    gl.uniform3fv(uniform(gl, p, 'uLight'), CONFIG.render.lightDirection);
    gl.uniform4f(uniform(gl, p, 'uLighting'), CONFIG.render.ambientLight, CONFIG.render.diffuseLight, this.firstPerson ? settings.rimStrength : CONFIG.render.rimStrength, CONFIG.render.rimPower);
    view.color('uSurface', CONFIG.colors.surface); view.color('uGridMinor', CONFIG.colors.gridMinor);
    view.color('uGridMajor', CONFIG.colors.gridMajor); view.color('uEquator', CONFIG.colors.equator); view.color('uRim', CONFIG.colors.rim);
    view.color('uFogColor', CONFIG.colors.firstPersonSky);
    const fogEnabled = this.firstPerson && settings.fogFar > 0;
    const fogExtension = fogEnabled ? Math.max(0, this.cameraPose.distance - settings.setback) : 0;
    gl.uniform2f(uniform(gl, p, 'uFogRange'), fogEnabled ? (settings.fogNear + fogExtension) * radius : 0, fogEnabled ? (settings.fogFar + fogExtension * settings.orbit.fogDistanceScale) * radius : 0);
    view.gridUniforms(this.firstPerson ? settings.grid : CONFIG.grid);
    view.areaUniforms(!!this.closedRegion?.boundsArea, CONFIG.area.sphereOpacity);
    gl.uniform1f(uniform(gl, p, 'uCurvatureOpacity'), model.isDeviation || model.isGeodesic ? CONFIG.deviation.surfaceTintOpacity : 0);
    const mesh = this.firstPerson ? (this.closeMeshes[this.surface.type] ??= surfaceMesh(gl, this.surface.isTorus, settings)) : this.meshes[this.surface.type];
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);

    const batch = new Batch(view.width, view.height);
    this.principalLabels = [];
    this.deviationLabels = [];
    this.angleLabel = null;
    if (model.isGeodesic) {
      drawGeodesicConstruction(this, batch, model);
      return;
    }
    if (model.isDeviation) {
      if (model.construction?.enabled) {
        drawDeviationStrip(this, batch, model); view.drawBatch(batch); batch.vertices.length = 0;
      }
      this.drawGeodesics(batch, model, toScreen, options);
      if (model.construction?.enabled) {
        batch.vertices.length = 0; drawDeviationConstruction(this, batch, model);
      }
      return;
    }
    if (options.tangent) this.tangentPlane(batch, model, toScreen);
    if (!model.distance || model.demo) {
      for (let i = 1; i < model.preview.length; i++) batch.line(toScreen(this.world(model.preview[i - 1])), toScreen(this.world(model.preview[i])), CONFIG.loop.previewWidthPx, this.rgba('path', CONFIG.loop.previewOpacity));
    }
    const points = options.trail ? [...model.trail, model.snapshot()] : [];
    for (let i = 1; i < points.length; i++) batch.line(toScreen(this.world(points[i - 1])), toScreen(this.world(points[i])), CONFIG.trail.lineWidthPx, this.rgba('path', 0.86));
    batch.ring(toScreen(this.world(model.start, CONFIG.geometry.arrowSurfaceOffset)), 6.5, 1, this.rgba('start', 0.7));
    this.drawAngleArc(batch, model, toScreen);
    const anchor = toScreen(this.world(model, CONFIG.geometry.arrowSurfaceOffset));
    batch.disk(anchor, CONFIG.geometry.markerRadiusPx * 2.2, this.rgba('arrow', 0.08));
    batch.disk(anchor, CONFIG.geometry.markerRadiusPx, this.rgba('arrow'));
    batch.disk(anchor, CONFIG.geometry.markerRadiusPx * 0.38, [1, 0.96, 0.86, 1]);
    view.drawBatch(batch);
    this.globeArrow(model.start, model.initialAngle, CONFIG.geometry.startArrowScale, this.rgba('start', 0.64));
    if (options.history) for (const point of model.history) {
      if (this.surface.distance(point, model) > 0.12 && this.surface.distance(point, model.start) > 0.1) this.globeArrow(point, model.initialAngle + point.rotation, CONFIG.geometry.historyArrowScale, this.rgba('arrow', CONFIG.trail.historyOpacity));
    }
    this.globeArrow(model, model.angle, 1, this.rgba('arrow'));
  }

  drawGeodesics(batch, model, toScreen, options) {
    const c = CONFIG.deviation, close = CONFIG.firstPerson, radius = CONFIG.geometry.sphereRadius;
    const velocityOffset = this.firstPerson ? close.arrowSurfaceOffset : this.surface.isTorus ? c.torusVelocityOffset : CONFIG.geometry.arrowSurfaceOffset;
    const arrowScale = this.firstPerson ? close.arrowScale : this.surface.isTorus ? c.torusVelocityArrowScale : c.velocityArrowScale;
    const pathOffset = this.firstPerson ? close.pathSurfaceOffset : CONFIG.geometry.pathSurfaceOffset;
    const indices = options.otherPath ? [0, 1] : [1];
    const projectPoint = p => projectVisible(p, this.matrix, this.sphere.width, this.sphere.height);
    const worldLine = (a, b, width, color) => {
      const segment = projectSegment(a, b, this.matrix, this.sphere.width, this.sphere.height);
      if (segment) batch.line(...segment, width, color);
    };
    const line = (points, width, color) => {
      for (let i = 1; i < points.length; i++) worldLine(this.world(points[i - 1], pathOffset), this.world(points[i], pathOffset), width, color);
    };
    if (options.otherPath) line(model.initialConnector.points, 1, this.rgba('separation', 0.25));
    for (const i of indices) {
      const point = model.particles[i], key = i ? 'geodesicB' : 'geodesicA';
      line([...model.trails[i], point], this.firstPerson ? close.trailWidthPx : c.trailWidthPx, this.rgba(key, 0.95));
      const start = projectPoint(this.world(model.trails[i][0], pathOffset));
      if (start && !this.firstPerson) batch.ring(start, 4, 1, this.rgba(key, 0.65));
      const marker = projectPoint(this.world(point, this.firstPerson ? velocityOffset : pathOffset));
      if (marker) batch.disk(marker, this.firstPerson ? close.markerRadiusPx : CONFIG.geometry.markerRadiusPx, this.rgba(key));
      if (this.surface.isTorus && !this.firstPerson) worldLine(this.world(point), this.world(point, velocityOffset), 1, this.rgba(key, 0.5));
      if (this.firstPerson || (i === 1 && model.construction?.enabled && model.construction.phase === 'transport')) continue;
      const building = model.construction?.enabled;
      const labelWorld = add(this.world(point, velocityOffset + (building ? 0 : c.velocityLabelNormalOffset)), scale(tangentVector(point.latitude, point.longitude, point.angle), (CONFIG.geometry.arrowLength * arrowScale + (building ? 0 : c.velocityLabelGap)) * radius));
      const label = toScreen(labelWorld);
      this.deviationLabels.push({ x: label[0], y: label[1] + (building ? -c.construction.velocityLabelGapPx : i ? -7 : 7), visible: this.visible(labelWorld), text: options.otherPath ? i ? 'v₂' : 'v₁' : 'v', color: CONFIG.colors[key] });
    }
    if (options.otherPath && model.connector.valid && !model.construction?.enabled) {
      const points = model.connector.points, end = points.at(-1);
      line(points, c.separationWidthPx, this.rgba('separation'));
      if (model.gap > 1e-6) {
        const tip = this.world(end, pathOffset), f = frame(end.latitude, end.longitude);
        const tangent = tangentVector(end.latitude, end.longitude, end.angle), side = cross(f.normal, tangent);
        const head = Math.min(c.separationHeadLength * (this.firstPerson ? close.separationHeadScale : 1), model.gap * 0.28) * radius;
        const halfWidth = head * c.separationHeadWidth / c.separationHeadLength;
        const base = add(tip, scale(tangent, -head));
        // Clip both sides of the arrowhead too, including near-plane crossings.
        worldLine(tip, add(base, scale(side, halfWidth)), 2, this.rgba('separation'));
        worldLine(tip, add(base, scale(side, -halfWidth)), 2, this.rgba('separation'));
      }
      const mid = points[Math.floor(points.length / 2)], labelWorld = this.world(mid, CONFIG.geometry.arrowSurfaceOffset);
      const label = toScreen(labelWorld);
      this.deviationLabels.push({ x: label[0] + 10, y: label[1] - 12, visible: !this.firstPerson && this.visible(labelWorld), text: 'ξ', color: CONFIG.colors.separation });
    }
    this.sphere.drawBatch(batch);
    for (const i of indices) {
      const point = model.particles[i];
      const build = model.construction;
      const opacity = i === 0 && build?.enabled && build.phase === 'transport'
        ? 1 - build.transportFraction * (1 - build.config.transportSourceOpacity) : 1;
      this.globeArrow(point, point.angle, arrowScale, this.rgba(i ? 'geodesicB' : 'geodesicA', opacity), velocityOffset, c.velocityArrowThickness, build?.enabled);
    }
    this.geodesicView = { paths: indices, velocityOffset, arrowScale, pathOffset, firstPerson: this.firstPerson };
  }

  tangentPlane(batch, point, toScreen) {
    const f = frame(point.latitude, point.longitude), c = CONFIG.curvature;
    const origin = this.world(point, this.surface.isTorus ? c.torusPlaneOffset : c.spherePlaneOffset);
    const radius = CONFIG.geometry.tangentRadius * CONFIG.geometry.sphereRadius;
    const center = toScreen(origin), segments = CONFIG.geometry.circleSegments;
    const at = (angle) => toScreen(add(origin, add(scale(f.east, radius * Math.cos(angle)), scale(f.north, radius * Math.sin(angle)))));
    for (let i = 0; i < segments; i++) {
      const a = at(i / segments * TAU), b = at((i + 1) / segments * TAU);
      batch.triangle(center, a, b, this.rgba('tangent', CONFIG.geometry.tangentOpacity));
      batch.line(a, b, 0.75, this.rgba('tangent', 0.45));
    }
    const principal = this.surface.principal(point.latitude), size = CONFIG.geometry.sphereRadius;
    for (const [i, axis, side, value] of [[0, f.east, f.north, principal.east], [1, f.north, f.east, principal.north]]) {
      const color = this.signedColor(value);
      const at = (x, y = 0) => add(origin, add(scale(axis, x * size), scale(side, y * size)));
      batch.line(toScreen(at(-c.axisRadius)), toScreen(at(c.axisRadius)), c.axisWidthPx, this.rgba(color, 0.96));
      for (const sign of [-1, 1]) {
        const neck = sign * (c.axisRadius - c.arrowheadLength);
        batch.triangle(toScreen(at(sign * c.axisRadius)), toScreen(at(neck, c.arrowheadWidth)), toScreen(at(neck, -c.arrowheadWidth)), this.rgba(color));
      }
      const position = add(at(-c.labelRadius), scale(f.normal, c.labelNormalOffset * size)), label = toScreen(position);
      this.principalLabels[i] = { x: label[0], y: label[1], visible: this.visible(position), color: CONFIG.colors[color] };
    }
  }

  globeArrow(point, angle, size, color, offset = CONFIG.geometry.arrowSurfaceOffset, thickness = 1, screenSized = false) {
    const origin = this.world(point, offset);
    const vector = tangentVector(point.latitude, point.longitude, angle);
    const shape = this.firstPerson ? [1, CONFIG.firstPerson.arrowWidthScale, CONFIG.firstPerson.arrowHeightScale] : [1, thickness, thickness];
    let headLength = null;
    if (screenSized) {
      const c = CONFIG.deviation.construction, g = CONFIG.geometry, m = this.matrix;
      const worldScale = size * g.sphereRadius;
      const depth = p => m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      const tip = add(origin, scale(vector, g.arrowLength * worldScale));
      // Use the nearer endpoint so perspective cannot thicken an approaching
      // tip. CSS pixels keep the cap independent of device pixel ratio.
      const unitsPerPixel = 2 * Math.max(1e-8, Math.min(depth(origin), depth(tip)))
        / (this.sphere.height * Math.hypot(m[1], m[5], m[9]));
      const widthScale = Math.min(1, unitsPerPixel * c.velocityShaftWidthPx
        / (g.arrowShaftWidth * worldScale * Math.max(shape[1], shape[2])));
      shape[1] *= widthScale; shape[2] *= widthScale;
      headLength = Math.min(g.arrowLength * g.arrowHeadFraction, unitsPerPixel * c.velocityHeadLengthPx / worldScale);
    }
    this.arrow.draw(origin, vector, frame(point.latitude, point.longitude).normal, size, color, this.matrix, this.eye, shape, true, headLength);
  }

  drawAngleArc(batch, model, toScreen) {
    this.angleLabel = null;
    const region = this.closedRegion;
    if (!region) return;
    const color = this.signedColor(region.theta);
    const radius = CONFIG.geometry.sphereRadius, origin = this.world(model.start, this.surface.isTorus ? CONFIG.area.torusAngleOffset : CONFIG.geometry.arrowSurfaceOffset);
    const f = frame(model.start.latitude, model.start.longitude);
    const at = (angle, r) => toScreen(add(origin, scale(tangentVector(model.start.latitude, model.start.longitude, angle), r * radius)));
    const center = toScreen(origin), segments = CONFIG.area.angleArcSegments;
    for (let i = 0; i < segments; i++) {
      const a = model.initialAngle + region.theta * i / segments;
      const b = model.initialAngle + region.theta * (i + 1) / segments;
      const p = at(a, CONFIG.area.angleArcRadius), q = at(b, CONFIG.area.angleArcRadius);
      batch.triangle(center, p, q, this.rgba(color, CONFIG.area.angleArcFillOpacity));
      batch.line(p, q, CONFIG.area.angleArcWidthPx, this.rgba(color, 0.95));
    }
    const labelWorld = add(add(origin, scale(tangentVector(model.start.latitude, model.start.longitude, model.initialAngle + region.theta / 2), CONFIG.area.angleLabelRadius * radius)), scale(f.normal, CONFIG.curvature.labelNormalOffset * radius));
    const label = toScreen(labelWorld);
    for (const principal of this.principalLabels) {
      if (principal.visible && Math.abs(label[0] - principal.x) < CONFIG.area.labelAvoidanceWidthPx && Math.abs(label[1] - principal.y) < CONFIG.area.labelAvoidanceHeightPx) label[1] -= CONFIG.area.labelShiftPx;
    }
    this.angleLabel = { x: label[0], y: label[1], visible: this.visible(labelWorld) };
  }

  mapPoint(point, shift = 0, shiftY = 0) {
    const latitude = this.surface.isTorus ? wrapPi(point.latitude) : point.latitude;
    return [(wrapPi(point.longitude) / TAU + 0.5) * this.map.width + shift, (0.5 - latitude / this.surface.chartHeight) * this.map.height + shiftY, 0];
  }
  mapCopies(point) {
    if (this.polarMap) {
      const p = polarScreenPoint(point, this.polarLayout, this.sphereMap.pole), margin = CONFIG.geometry.mapArrowLengthPx;
      return p && p[0] >= -margin && p[0] <= this.map.width + margin && p[1] >= -margin && p[1] <= this.map.height + margin ? [p] : [];
    }
    const result = [];
    for (const x of [-this.map.width, 0, this.map.width]) for (const y of this.surface.isTorus ? [-this.map.height, 0, this.map.height] : [0]) result.push(this.mapPoint(point, x, y));
    return result;
  }
  mapDirection(point, angle) {
    if (!this.surface.isTorus) return sphereMapDirection(point, angle, this.polarMap, this.sphereMap?.pole);
    const g = this.surface.metric(point.latitude);
    return [Math.cos(angle) / g.east * this.map.width / TAU, -Math.sin(angle) / g.north * this.map.height / this.surface.chartHeight];
  }

  drawMap(model, options) {
    const view = this.map, gl = view.gl;
    this.sphereMap = options.sphereMap;
    this.polarMap = !this.surface.isTorus && !!this.sphereMap?.enabled;
    this.polarLayout = this.polarMap ? this.sphereMap.layout(view.width, view.height) : null;
    view.background = this.polarMap ? this.polarMapProgram : this.coordinateMapProgram;
    view.start(false);
    view.surfaceUniforms(this.surface);
    view.color('uBackground', CONFIG.colors.mapBackground); view.color('uGridMinor', CONFIG.colors.mapGridMinor);
    view.color('uGridMajor', CONFIG.colors.mapGridMajor); view.color('uEquator', CONFIG.colors.mapEquator);
    view.gridUniforms();
    if (this.polarMap) {
      const p = view.background, step = this.sphereMap.latitudeGridStep();
      gl.uniform2f(uniform(gl, p, 'uViewport'), view.width, view.height);
      gl.uniform1f(uniform(gl, p, 'uPixelsPerUnit'), this.polarLayout.scale);
      gl.uniform1f(uniform(gl, p, 'uPole'), this.sphereMap.pole);
      gl.uniform2f(uniform(gl, p, 'uLatitudeGridStep'), step, step * CONFIG.sphereMap.majorLatitudeEvery);
    }
    view.areaUniforms(!!this.closedRegion?.boundsArea, CONFIG.area.mapOpacity);
    gl.bindVertexArray(view.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const batch = new Batch(view.width, view.height);
    if (!model.distance || model.demo) this.mapPath(batch, model.preview, CONFIG.loop.previewWidthPx, this.rgba('path', CONFIG.loop.previewOpacity));
    const points = options.trail ? [...model.trail, model.snapshot()] : [];
    this.mapPath(batch, points, CONFIG.trail.lineWidthPx, this.rgba('path', 0.92));
    this.mapArrow(batch, model.start, model.initialAngle, CONFIG.geometry.startArrowScale, this.rgba('start', 0.65));
    for (const origin of this.mapCopies(model.start)) batch.ring(origin, 6.5, 1, this.rgba('start', 0.65));
    if (this.closedRegion) this.mapAngleArc(batch, model);
    if (options.history) for (const point of model.history) {
      if (this.surface.distance(point, model) > 0.14 && this.surface.distance(point, model.start) > 0.1) this.mapArrow(batch, point, model.initialAngle + point.rotation, CONFIG.geometry.historyArrowScale, this.rgba('arrow', CONFIG.trail.historyOpacity));
    }
    this.mapArrow(batch, model, model.angle, 1, this.rgba('arrow'));
    for (const anchor of this.mapCopies(model)) {
      batch.disk(anchor, 11, this.rgba('arrow', 0.08));
      batch.disk(anchor, CONFIG.geometry.markerRadiusPx, this.rgba('arrow'));
      batch.disk(anchor, 1.5, [1, 0.96, 0.86, 1]);
    }
    view.drawBatch(batch);
    this.mapView = { projection: this.polarMap ? 'polar-stereographic' : 'equirectangular',
      arrows: this.surface.isTorus ? 'projected' : this.polarMap ? 'conformal' : 'local-east-north',
      pole: this.polarMap ? this.sphereMap.pole : null, radius: this.polarMap ? this.sphereMap.radius : null,
      arrowDirection: this.mapDirection(model, model.angle), point: this.polarMap ? polarScreenPoint(model, this.polarLayout, this.sphereMap.pole) : this.mapPoint(model) };
  }

  mapPath(batch, points, width, color) {
    const view = this.map;
    if (this.polarMap) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.latitude - a.latitude), Math.abs(b.longitude - a.longitude)) / CONFIG.sphereMap.pathStepRadians));
        let previous = polarScreenPoint(a, this.polarLayout, this.sphereMap.pole);
        for (let j = 1; j <= steps; j++) {
          const t = j / steps, next = polarScreenPoint({ latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t }, this.polarLayout, this.sphereMap.pole);
          const segment = clipMapSegment(previous, next, view.width, view.height);
          if (segment) batch.line(...segment, width, color);
          previous = next;
        }
      }
      return;
    }
    for (let i = 1; i < points.length; i++) {
      const a = this.mapPoint(points[i - 1]), b = this.mapPoint(points[i]);
      // Continue in unwrapped longitude, then draw translated copies at the seam.
      b[0] = a[0] + (points[i].longitude - points[i - 1].longitude) / TAU * view.width;
      b[1] = a[1] - (points[i].latitude - points[i - 1].latitude) / this.surface.chartHeight * view.height;
      for (const shift of [-view.width, 0, view.width]) {
        if (Math.max(a[0], b[0]) + shift < 0 || Math.min(a[0], b[0]) + shift > view.width) continue;
        for (const dy of this.surface.isTorus ? [-view.height, 0, view.height] : [0]) {
          if (Math.max(a[1], b[1]) + dy < 0 || Math.min(a[1], b[1]) + dy > view.height) continue;
          batch.line([a[0] + shift, a[1] + dy, 0], [b[0] + shift, b[1] + dy, 0], width, color);
        }
      }
    }
  }

  mapArrow(batch, point, angle, size, color) {
    const g = CONFIG.geometry;
    // Sphere: local compass glyphs, or conformally projected polar directions.
    // Torus retains its original projected direction and fixed display length.
    const [vx, vy] = this.mapDirection(point, angle);
    const norm = Math.hypot(vx, vy), dx = vx / norm, dy = vy / norm;
    const length = g.mapArrowLengthPx * size, neck = length * (1 - g.arrowHeadFraction);
    for (const origin of this.mapCopies(point)) {
      if (origin[0] < -length || origin[0] > this.map.width + length) continue;
      const at = (x, y) => [origin[0] + dx * x - dy * y, origin[1] + dy * x + dx * y, 0];
      const sw = g.mapArrowShaftWidthPx * size / 2, hw = g.mapArrowHeadWidthPx * size / 2;
      batch.triangle(at(0, sw), at(0, -sw), at(neck, sw), color);
      batch.triangle(at(0, -sw), at(neck, -sw), at(neck, sw), color);
      batch.triangle(at(neck, hw), at(neck, -hw), at(length, 0), color);
    }
  }

  mapAngleArc(batch, model) {
    const color = this.signedColor(this.closedRegion.theta);
    for (const center of this.mapCopies(model.start)) {
      const at = (fraction) => {
        const angle = model.initialAngle + this.closedRegion.theta * fraction;
        const [vx, vy] = this.mapDirection(model.start, angle);
        const length = Math.hypot(vx, vy);
        return [center[0] + vx / length * CONFIG.area.angleArcMapRadiusPx, center[1] + vy / length * CONFIG.area.angleArcMapRadiusPx, 0];
      };
      for (let i = 0; i < CONFIG.area.angleArcSegments; i++) {
        const p = at(i / CONFIG.area.angleArcSegments), q = at((i + 1) / CONFIG.area.angleArcSegments);
        batch.triangle(center, p, q, this.rgba(color, CONFIG.area.angleArcFillOpacity));
        batch.line(p, q, CONFIG.area.angleArcWidthPx, this.rgba(color, 0.9));
      }
    }
  }

  polePosition(north) {
    if (this.firstPerson || this.isTidal || this.isGeodesic) return { x: 0, y: 0, visible: false };
    const radius = CONFIG.geometry.sphereRadius;
    const normal = [0, north ? 1 : -1, 0];
    const position = scale(normal, radius * 1.1);
    const screen = project(position, this.matrix, this.sphere.width, this.sphere.height);
    return { x: screen[0], y: screen[1], visible: !this.surface.isTorus && dot(normal, this.eye) > -0.1 * radius };
  }
}
