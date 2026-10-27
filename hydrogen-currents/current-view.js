const vertexSource=`
  attribute vec3 a_position;
  attribute vec4 a_color;
  uniform vec3 u_right,u_up,u_toward;
  uniform float u_radius,u_zoom,u_aspect,u_size;
  varying vec4 v_color;
  void main(){
    vec3 p=a_position/u_radius;
    float depth=dot(p,u_toward);
    gl_Position=vec4(dot(p,u_right)*u_aspect*u_zoom*.88,dot(p,u_up)*u_zoom*.88,-depth*.25,1.);
    gl_PointSize=u_size;
    v_color=vec4(a_color.rgb,a_color.a*(.4+.6*clamp(.5+.5*depth,0.,1.)));
  }`;
const fragmentSource=`
  precision mediump float;
  varying vec4 v_color;
  void main(){
    vec2 uv=gl_PointCoord*2.-1.;float r2=dot(uv,uv);
    if(r2>1.)discard;
    float coverage=exp(-2.*r2)*(1.-smoothstep(.75,1.,r2));
    gl_FragColor=vec4(v_color.rgb,v_color.a*coverage);
  }`;

function setup(canvas,alpha) {
  const gl=canvas.getContext('webgl',{alpha,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
  if(!gl)throw new Error('WebGL is needed for the orbital point cloud.');
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]) {
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(alpha?0:11/255,alpha?0:17/255,alpha?0:29/255,alpha?0:1);
  const uniforms=Object.fromEntries(['right','up','toward','radius','zoom','aspect','size'].map(key=>[key,gl.getUniformLocation(program,'u_'+key)]));
  return {canvas,gl,program,uniforms,buffer:gl.createBuffer(),position:gl.getAttribLocation(program,'a_position'),color:gl.getAttribLocation(program,'a_color')};
}

export class PointCloudView {
  constructor(densityCanvas,flowCanvas,onChange) {
    this.density=setup(densityCanvas,false);this.flow=setup(flowCanvas,true);
    this.onChange=onChange;this.radius=1;this.count=0;this.flowCount=0;this.flowData=new Float32Array();
    this.azimuth=.6;this.elevation=.35;this.zoom=1;this.pointers=new Map();
    this.updateAxes();
    const canvas=flowCanvas;
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0&&event.pointerType==='mouse')return;
      canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove',event=>{
      const previous=this.pointers.get(event.pointerId);if(!previous)return;
      const old=[...this.pointers.values()];
      this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      const now=[...this.pointers.values()];
      if(now.length===1) {
        this.azimuth-=(event.clientX-previous.x)*.009;
        this.elevation=Math.max(-Math.PI/2,Math.min(Math.PI/2,this.elevation+(event.clientY-previous.y)*.009));
      } else {
        const distance=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
        this.zoom=Math.max(.45,Math.min(4,this.zoom*distance(now)/Math.max(1,distance(old))));
      }
      this.cameraChanged();
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{
      this.pointers.delete(event.pointerId);if(!this.pointers.size)canvas.classList.remove('dragging');
    });
    canvas.addEventListener('wheel',event=>{
      event.preventDefault();const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);
      this.zoomBy(Math.exp(-pixels*.0015));
    },{passive:false});
    canvas.addEventListener('dblclick',()=>this.reset());
    canvas.addEventListener('keydown',event=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
        event.preventDefault();this.azimuth+=event.key==='ArrowLeft'?.12:event.key==='ArrowRight'?-.12:0;
        this.elevation=Math.max(-Math.PI/2,Math.min(Math.PI/2,this.elevation+(event.key==='ArrowUp'?.12:event.key==='ArrowDown'?-.12:0)));
        this.cameraChanged();
      } else if(['+','=','-','_','Home'].includes(event.key)) {
        event.preventDefault();if(event.key==='Home')this.reset();else this.zoomBy(['+','='].includes(event.key)?1.15:1/1.15);
      }
    });
    new ResizeObserver(()=>{this.drawDensity();this.drawFlow();}).observe(canvas);
    for(const [name,target,alpha] of [['density',densityCanvas,false],['flow',flowCanvas,true]]) {
      target.addEventListener('webglcontextlost',event=>event.preventDefault());
      target.addEventListener('webglcontextrestored',()=>{
        this[name]=setup(target,alpha);
        if(name==='density')this.setDensity(this.positions,this.radius);else this.drawFlow();
      });
    }
  }

  updateAxes() {
    const a=this.azimuth,e=this.elevation;
    this.right=[Math.cos(a),Math.sin(a),0];
    this.up=[-Math.sin(a)*Math.sin(e),Math.cos(a)*Math.sin(e),Math.cos(e)];
    this.toward=[Math.sin(a)*Math.cos(e),-Math.cos(a)*Math.cos(e),Math.sin(e)];
    const line=document.getElementById('orbital-z-axis'),label=document.getElementById('orbital-z-label');
    if(line)line.setAttribute('y2',32-24*Math.cos(e));
    if(label) {label.setAttribute('y',Math.max(11,29-24*Math.cos(e)));label.textContent=Math.abs(Math.cos(e))<.08?(e>0?'z ⊙':'z ⊗'):'z';}
  }

  cameraChanged() {
    this.updateAxes();this.drawDensity();this.drawFlow();this.onChange?.();
  }

  zoomBy(factor) {this.zoom=Math.max(.45,Math.min(4,this.zoom*factor));this.cameraChanged();}
  reset() {this.azimuth=.6;this.elevation=.35;this.zoom=1;this.cameraChanged();}

  prepare(target,size) {
    if(target.gl.isContextLost())return false;
    const {gl,canvas,program,uniforms}=target;
    const ratio=Math.min(2,window.devicePixelRatio||1);
    const width=Math.max(1,Math.round(canvas.clientWidth*ratio)),height=Math.max(1,Math.round(canvas.clientHeight*ratio));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);gl.useProgram(program);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform3fv(uniforms.right,this.right);gl.uniform3fv(uniforms.up,this.up);gl.uniform3fv(uniforms.toward,this.toward);
    gl.uniform1f(uniforms.radius,this.radius);gl.uniform1f(uniforms.zoom,this.zoom);
    gl.uniform1f(uniforms.aspect,height/width);gl.uniform1f(uniforms.size,size*height/360*Math.sqrt(this.zoom));
    gl.bindBuffer(gl.ARRAY_BUFFER,target.buffer);gl.enableVertexAttribArray(target.position);
    return true;
  }

  setDensity(positions,radius) {
    this.positions=positions;this.radius=radius;this.count=positions.length/3;
    const {gl,buffer}=this.density;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);this.drawDensity();
  }

  drawDensity() {
    if(!this.prepare(this.density,1.55))return;
    const {gl,position,color}=this.density;
    gl.vertexAttribPointer(position,3,gl.FLOAT,false,12,0);gl.disableVertexAttribArray(color);
    gl.vertexAttrib4f(color,.92,.95,1,.19);gl.drawArrays(gl.POINTS,0,this.count);
  }

  setFlow(tracers,timeScale) {
    const length=tracers.length*3*7;
    if(this.flowData.length!==length)this.flowData=new Float32Array(length);
    let index=0;
    for(const tracer of tracers)for(let echo=2;echo>=0;echo--) {
      const angle=tracer.angle-tracer.omega*timeScale*.035*echo;
      const moving=Math.abs(tracer.omega)>1e-12,color=moving?(tracer.omega>0?[1,.84,.22]:[.3,.57,1]):[1,1,1];
      this.flowData.set([tracer.s*Math.cos(angle),tracer.s*Math.sin(angle),tracer.z,...color,
        moving?(echo===0?.95:echo===1?.28:.1):(echo===0?.5:0)],index);index+=7;
    }
    this.flowCount=length/7;this.drawFlow();
  }

  drawFlow() {
    if(!this.prepare(this.flow,2.6))return;
    const {gl,position,color}=this.flow;
    gl.bufferData(gl.ARRAY_BUFFER,this.flowData,gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(position,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color,4,gl.FLOAT,false,28,12);gl.drawArrays(gl.POINTS,0,this.flowCount);
  }
}
