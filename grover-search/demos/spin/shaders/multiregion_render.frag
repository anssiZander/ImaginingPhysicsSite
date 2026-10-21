#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uWave;
uniform float uVisGain;
uniform float uVisGamma;
uniform int uSide;
uniform int uShowGrid;
uniform int uShowMarkers;
uniform int uTarget;
uniform int uInitial;
uniform int uWaveView;
uniform int uGateRegion;
uniform float uGateFlash;
uniform float uPixelSize;
in vec2 vUV;
out vec4 fragColor;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 phasePalette(float phase, float intensity) {
  float hue = fract(phase / 6.28318530718 + 1.0);
  float structure = smoothstep(.015, .20, intensity);
  return hsv2rgb(vec3(hue, mix(.28, .94, structure), .075 + .925 * intensity));
}
vec2 regionCenter(int q) { return (vec2(float(q / uSide), float(q % uSide)) + .5) / float(uSide); }
float regionMask(vec2 uv, int q) {
  vec2 distance = abs(uv - regionCenter(q));
  float halfCell=.5/float(uSide);
  return (1.0 - smoothstep(halfCell-.002, halfCell+.002, distance.x)) * (1.0 - smoothstep(halfCell-.002, halfCell+.002, distance.y));
}

void main() {
  vec2 uv = clamp(vUV, 0.0, 1.0);
  vec2 texel = 1.0 / vec2(textureSize(uWave, 0));
  vec4 spinor=texture(uWave,mix(.5*texel,1.0-.5*texel,uv));
  vec2 psi=uWaveView==2?spinor.zw:spinor.xy;
  float up=dot(spinor.xy,spinor.xy),down=dot(spinor.zw,spinor.zw);
  float rho=uWaveView==0?up+down:dot(psi,psi);
  float intensity=pow(clamp(1.0-exp(-uVisGain*rho),0.0,1.0),uVisGamma);
  float phase=rho>1e-20?atan(psi.y,psi.x):0.0;
  vec3 col;
  if(uWaveView==0){
    float spinZ=(up-down)/max(up+down,1e-20);
    vec3 tint=mix(vec3(.86,.12,.52),vec3(.08,.72,.98),.5+.5*spinZ);
    tint=mix(vec3(.42,.25,.82),tint,abs(spinZ));
    col=vec3(.008,.015,.035)+intensity*tint;
    col+=.18*pow(intensity,5.0)*vec3(.8,.95,1.0);
  }else col=phasePalette(phase,intensity);

  float wall = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
  float rim = 1.0 - smoothstep(uPixelSize, 3.0 * uPixelSize, wall);
  col = mix(col, vec3(.35,.94,1.0), .82 * rim);
  col += vec3(.05,.38,.88) * exp(-wall * 96.0) * .30;
  if (uShowGrid == 1) {
    vec2 nearest = abs(uv * float(uSide) - floor(uv * float(uSide) + .5)) / float(uSide);
    float lines = 1.0 - smoothstep(.6 * uPixelSize, 1.7 * uPixelSize, min(nearest.x, nearest.y));
    col = mix(col, vec3(.18,.55,.72), .45 * lines);
  }
  if (uShowMarkers == 1) {
    vec2 d = abs(uv - regionCenter(uTarget));
    float halfCell=.5/float(uSide),inset=halfCell-2.0*uPixelSize;
    float edge = min(abs(d.x - inset), abs(d.y - inset));
    float within = step(d.x, halfCell) * step(d.y, halfCell);
    float glow = within * (1.0 - smoothstep(.004, .025, edge));
    float border = within * (1.0 - smoothstep(.7 * uPixelSize, 2.2 * uPixelSize, edge));
    col = mix(col, col * vec3(1.06,.76,.80) + vec3(.13,.005,.012), .20 * regionMask(uv, uTarget));
    col += vec3(1.0,.015,.035) * (.34 * glow + 1.05 * border);
    // An inner green outline keeps both choices visible when they share a cell.
    d = abs(uv - regionCenter(uInitial));
    float initialInset = uInitial == uTarget ? 8.0 : 2.0;
    inset = halfCell - initialInset * uPixelSize;
    edge = min(abs(d.x - inset), abs(d.y - inset));
    float extent = min(halfCell, inset + 2.2 * uPixelSize);
    within = step(d.x, extent) * step(d.y, extent);
    glow = within * (1.0 - smoothstep(.004, .025, edge));
    border = within * (1.0 - smoothstep(.7 * uPixelSize, 2.2 * uPixelSize, edge));
    col += vec3(.025,.11,.035) * .18 * regionMask(uv, uInitial);
    col += vec3(.08,1.0,.22) * .28 * glow;
    col = mix(col,vec3(.08,1.0,.22),.94*border);
    if (uGateRegion >= 0) col += vec3(1.0,.28,.72) * regionMask(uv, uGateRegion) * uGateFlash * .16;
  }
  fragColor = vec4(col, 1.0);
}
