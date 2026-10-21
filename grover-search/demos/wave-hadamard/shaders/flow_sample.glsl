// Shared by particle integration and the current arrows. Manual bilinear
// sampling also works on WebGL2 devices without float-linear filtering.
vec4 flowSample(sampler2D tex,vec2 uv) {
  ivec2 last=textureSize(tex,0)-1;
  vec2 p=clamp(uv,0.0,1.0)*vec2(last);ivec2 a=ivec2(floor(p)),b=min(a+1,last);
  vec2 t=fract(p);
  return mix(mix(texelFetch(tex,a,0),texelFetch(tex,ivec2(b.x,a.y),0),t.x),
    mix(texelFetch(tex,ivec2(a.x,b.y),0),texelFetch(tex,b,0),t.x),t.y);
}
vec2 flowPsi(vec4 parts,float angle) {
  float c=cos(angle),s=sin(angle);
  return parts.xy+vec2(c*parts.z+s*parts.w,c*parts.w-s*parts.z);
}
vec2 flowCurrent(vec4 parts,float angle,float rate) {
  return rate*(-sin(angle)*parts.xy+cos(angle)*parts.zw);
}
