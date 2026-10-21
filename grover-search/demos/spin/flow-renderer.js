import { HBAR_OVER_M } from './multiregion-core.js';
import { gateFlow, sampleInitialParticles } from './probability-flow.js';

// Spin circulation revisits the same pixels frequently. Keep the underlying
// light accumulation, but lower its displayed exposure to reveal the spinor.
const TRAIL_EXPOSURE = .18;

export class FlowRenderer {
  constructor(gl, grid, loadShader, createProgram) {
    Object.assign(this,{gl,grid,loadShader,createProgram});
    this.side=4;this.initial=0;this.count=4000;this.index=0;this.trailIndex=0;this.gate=null;this.newGate=false;
    this.trailSize=1024;this.trailScale=1;this.elapsed=0;this.statsTime=-Infinity;
  }
  async init(vertex) {
    const loadShader=this.loadShader;
    const [basis,shared,update,empty,points,dots,arrows,arrowFragment,trail,trailFragment,composite,fade,probe,spinVertex,spinFragment]=await Promise.all([
      loadShader('flow_basis.frag'),loadShader('flow_sample.glsl'),loadShader('flow_particle_update.vert'),
      loadShader('particle_update.frag'),loadShader('flow_particles.vert'),loadShader('particle_render.frag'),
      loadShader('flow_arrows.vert'),loadShader('phase_arrows.frag'),loadShader('flow_trail.vert'),
      loadShader('flow_trail.frag'),loadShader('flow_trail_composite.frag'),loadShader('flow_trail_fade.frag'),
      loadShader('flow_free_probe.frag'),loadShader('spin_glyphs.vert'),loadShader('spin_glyphs.frag'),
    ]);
    const program=this.createProgram;
    this.basis=program(vertex,basis,['uPotential[0]','uGridSize','uModes']);
    const fieldUniforms=['uCorrectionA','uCorrectionB','uFree','uSide','uFreeCoefficients[0]','uFixed[0]','uRotating[0]','uFreeSpan','uSpinAngle','uDuration','uHbarOverM'];
    this.update=program(update.replace('// FLOW_SAMPLE',shared),empty,
      [...fieldUniforms,'uEnd','uNewGate'],['nextState']);
    this.points=program(points,dots,['uPointSize','uDotSigma','uDotGain']);
    this.arrows=program(arrows.replace('// FLOW_SAMPLE',shared),arrowFragment,
      [...fieldUniforms,'uProgress','uGain','uArrowGrid','uCurrentMode']);
    this.probe=program(vertex,probe.replace('// FLOW_SAMPLE',shared),
      [...fieldUniforms,'uGridSize','uProgress']);
    this.spinGlyphs=program(spinVertex,spinFragment,['uWave','uSpinGrid']);
    this.trail=program(trail,trailFragment,['uWidth','uStampGain']);
    this.composite=program(vertex,composite,['uTrail','uScale']);
    this.fade=program(vertex,fade,['uTrail','uFade']);
    const gl=this.gl;
    this.emptyVao=gl.createVertexArray();this.feedback=gl.createTransformFeedback();
    this.buffers=[gl.createBuffer(),gl.createBuffer()];
    this.vaos=this.buffers.map(buffer=>{
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0);return vao;
    });
    this.segmentVaos=[0,1].map(i=>{
      const vao=gl.createVertexArray();gl.bindVertexArray(vao);
      for(let a=0;a<2;a++) {
        gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[a===0?i:1-i]);
        gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,16,0);gl.vertexAttribDivisor(a,1);
      }return vao;
    });
    this.correctionA=this.texture(this.grid,gl.RGBA32F,gl.FLOAT);
    this.correctionB=this.texture(this.grid,gl.RGBA32F,gl.FLOAT);
    this.basisFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.basisFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.correctionA,0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,this.correctionB,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
    this.checkFramebuffer();
    // DoubleSlit2.0-style additive light density, tone-mapped only at display.
    this.trailTextures=[0,1].map(()=>this.texture(this.trailSize,gl.RGBA16F,gl.HALF_FLOAT));
    this.trailFbos=this.trailTextures.map(tex=>{
      const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);this.checkFramebuffer();return fbo;
    });
    this.reset();
  }
  checkFramebuffer() {
    const gl=this.gl;
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Could not create probability-flow buffers.');
  }
  texture(size,format,type) {
    const gl=this.gl,tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,type===gl.FLOAT?gl.NEAREST:gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,type===gl.FLOAT?gl.NEAREST:gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,format,size,size,0,gl.RGBA,type,null);return tex;
  }
  bindTexture(texture,unit,uniform) {
    const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniform,unit);
  }
  clearTrails() {
    this.trailScale=1;this.trailIndex=0;
    const gl=this.gl;gl.clearColor(0,0,0,0);
    for(const fbo of this.trailFbos) {gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.clear(gl.COLOR_BUFFER_BIT);}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  reset(count=this.count,side=this.side,initial=this.initial) {
    this.side=side;this.initial=initial;this.newGate=false;this.stats=null;
    this.count=count;this.gate=null;this.data=null;this.index=0;this.elapsed=0;this.statsTime=-Infinity;
    const gl=this.gl,states=sampleInitialParticles(count,73991,side,initial);
    for(const buffer of this.buffers) {gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,states,gl.DYNAMIC_COPY);}
    gl.bindBuffer(gl.ARRAY_BUFFER,null);this.clearTrails();
  }
  prepare(gate,target) {
    if(this.gate===gate||!gate) return;
    this.gate=gate;this.newGate=true;
    this.data=gateFlow(gate.startAmplitudes,gate.kind,target,gate.duration,gate.initial??this.initial);
    if(this.data.mode==='free') return;
    const gl=this.gl,u=this.basis.uniforms;
    gl.disable(gl.BLEND);gl.bindVertexArray(this.emptyVao);gl.bindFramebuffer(gl.FRAMEBUFFER,this.basisFbo);
    gl.viewport(0,0,this.grid,this.grid);gl.useProgram(this.basis.program);
    gl.uniform1i(u.uModes,this.data.modes);
    gl.uniform3fv(u['uPotential[0]'],Float32Array.from(this.data.potential));gl.uniform1f(u.uGridSize,this.grid);
    gl.drawArrays(gl.TRIANGLES,0,3);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  fieldUniforms(u) {
    const gl=this.gl,free=this.data.mode==='free';
    gl.uniform1i(u.uFree,free?1:0);gl.uniform1i(u.uSide,this.data.side);
    gl.uniform1f(u.uDuration,this.data.duration);gl.uniform1f(u.uHbarOverM,HBAR_OVER_M);
    // Bind both sampler units even on the free branch. A newly allocated probe
    // attachment must never remain bound to a sampler in the active program.
    this.bindTexture(this.correctionA,0,u.uCorrectionA);this.bindTexture(this.correctionB,1,u.uCorrectionB);
    if(free) {
      gl.uniform4fv(u['uFreeCoefficients[0]'],Float32Array.from(this.data.coefficients));
      gl.uniform1f(u.uFreeSpan,this.data.span);gl.uniform1f(u.uSpinAngle,this.data.spinAngle);
    } else {
      gl.uniform4fv(u['uFixed[0]'],Float32Array.from(this.data.f));
      gl.uniform4fv(u['uRotating[0]'],Float32Array.from(this.data.g));
    }
  }
  step(gate,target,end,dt,params) {
    this.prepare(gate,target);
    const gl=this.gl,u=this.update.uniforms,before=this.index,after=1-before;
    gl.disable(gl.BLEND);gl.useProgram(this.update.program);
    this.fieldUniforms(u);
    gl.uniform1f(u.uEnd,end);gl.uniform1i(u.uNewGate,this.newGate?1:0);
    gl.bindVertexArray(this.vaos[before]);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.feedback);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,this.buffers[after]);
    gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,this.count);
    gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);
    this.index=after;this.newGate=false;this.elapsed+=dt;
    if(params.showTrails) this.stampTrails(before,dt,params);
  }
  stampTrails(before,dt,params) {
    const gl=this.gl;
    this.trailScale*=Math.exp(-Math.LN2*dt/params.trailHalfLife);
    gl.viewport(0,0,this.trailSize,this.trailSize);
    // Keep small per-step fades in full precision. Baking only at half intensity
    // avoids half-float rounding that could otherwise freeze long, slow trails.
    if(this.trailScale<.5) {
      const next=1-this.trailIndex,u=this.fade.uniforms;
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.trailFbos[next]);
      gl.bindVertexArray(this.emptyVao);gl.disable(gl.BLEND);gl.useProgram(this.fade.program);
      this.bindTexture(this.trailTextures[this.trailIndex],0,u.uTrail);gl.uniform1f(u.uFade,this.trailScale);
      gl.drawArrays(gl.TRIANGLES,0,3);this.trailIndex=next;this.trailScale=1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.trailFbos[this.trailIndex]);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
    gl.useProgram(this.trail.program);
    gl.uniform1f(this.trail.uniforms.uWidth,.35*params.particleSize/Math.max(1,gl.canvas.clientWidth));
    gl.uniform1f(this.trail.uniforms.uStampGain,.85*60*dt/this.trailScale);
    gl.bindVertexArray(this.segmentVaos[before]);gl.drawArraysInstanced(gl.TRIANGLES,0,6,this.count);
    gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  render(canvas,params,active,waveTexture) {
    const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
    gl.enable(gl.BLEND);
    if(params.showTrails) {
      gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);gl.bindVertexArray(this.emptyVao);
      gl.useProgram(this.composite.program);this.bindTexture(this.trailTextures[this.trailIndex],0,this.composite.uniforms.uTrail);
      gl.uniform1f(this.composite.uniforms.uScale,TRAIL_EXPOSURE*this.trailScale);gl.drawArrays(gl.TRIANGLES,0,3);
    }
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    if(params.showSpin) {
      gl.bindVertexArray(this.emptyVao);gl.useProgram(this.spinGlyphs.program);
      this.bindTexture(waveTexture,0,this.spinGlyphs.uniforms.uWave);
      gl.uniform1i(this.spinGlyphs.uniforms.uSpinGrid,12);
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,144);
    }
    if(params.showParticles) {
      gl.bindVertexArray(this.vaos[this.index]);gl.useProgram(this.points.program);
      const u=this.points.uniforms,dpr=canvas.width/canvas.clientWidth;
      gl.uniform1f(u.uPointSize,params.particleSize*dpr);gl.uniform1f(u.uDotSigma,.2);gl.uniform1f(u.uDotGain,.16);
      gl.drawArrays(gl.POINTS,0,this.count);
    }
    if(params.showCurrent&&active) {
      this.prepare(active,params.target);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.enable(gl.BLEND);
      gl.bindVertexArray(this.emptyVao);gl.useProgram(this.arrows.program);const u=this.arrows.uniforms;
      this.fieldUniforms(u);
      gl.uniform1f(u.uProgress,active.progress);gl.uniform1f(u.uDuration,active.duration);
      gl.uniform1i(u.uCurrentMode,params.currentMode);gl.uniform1f(u.uGain,params.currentGain);gl.uniform1i(u.uArrowGrid,params.arrowGrid);
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,params.arrowGrid**2);
    }
    gl.disable(gl.BLEND);
  }
  readParticles() {
    const gl=this.gl,data=new Float32Array(4*this.count);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[this.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    return data;
  }
  statistics(target,progress,force=false) {
    if(!force&&this.elapsed-this.statsTime<.3&&this.stats?.target===target) return this.stats;
    const data=this.readParticles(),bins=new Array(this.side*this.side).fill(0);let invalid=0,failures=0,lag=0,lagging=0,slowest=null;
    for(let i=0;i<this.count;i++) {
      const x=data[4*i],y=data[4*i+1];
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<=0||x>=1||y<=0||y>=1) invalid++;
      else bins[this.side*Math.floor(this.side*x)+Math.floor(this.side*y)]++;
      failures+=data[4*i+3];
      if(!this.newGate) {
        const behind=progress-data[4*i+2];if(behind>2e-6)lagging++;
        if(behind>lag){lag=behind;slowest=[x,y,data[4*i+2]];}
      }
    }
    this.statsTime=this.elapsed;
    this.stats={target,count:this.count,boxProbability:bins[target>>1]/this.count,bins,invalid,failures,maxLag:lag,lagging,slowest};return this.stats;
  }
  readField(progress=1) {
    if(!this.data)return null;
    const gl=this.gl,wave=new Float32Array(4*this.grid**2),current=new Float32Array(wave.length);
    // Separate probe attachments avoid framebuffer feedback and preserve correction textures.
    if(!this.probeFbo){
      this.probeFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.probeFbo);
      this.probeTextures=[0,1].map(i=>{
        const tex=this.texture(this.grid,gl.RGBA32F,gl.FLOAT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,tex,0);return tex;
      });
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);this.checkFramebuffer();
    }
    gl.disable(gl.BLEND);gl.bindVertexArray(this.emptyVao);gl.bindFramebuffer(gl.FRAMEBUFFER,this.probeFbo);
    gl.viewport(0,0,this.grid,this.grid);gl.useProgram(this.probe.program);const u=this.probe.uniforms;
    this.fieldUniforms(u);gl.uniform1f(u.uProgress,progress);gl.uniform1f(u.uGridSize,this.grid);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.readPixels(0,0,this.grid,this.grid,gl.RGBA,gl.FLOAT,wave);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);gl.readPixels(0,0,this.grid,this.grid,gl.RGBA,gl.FLOAT,current);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    return {wave,current,grid:this.grid,side:this.data.side,mode:this.data.mode,duration:this.data.duration};
  }
}
