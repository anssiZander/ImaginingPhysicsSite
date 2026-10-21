#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uDensity;
uniform float uGain;
uniform float uGamma;
uniform int uBlendMode;
uniform vec2 uCanvasSize;
uniform int uSquareBox;

in vec2 vUV;
out vec4 fragColor;

vec2 boxUVFromScreen(vec2 screenUV, out float insideBox) {
  insideBox = 1.0;
  if (uSquareBox == 0) return screenUV;

  vec2 canvasSize = max(uCanvasSize, vec2(1.0));
  float side = min(canvasSize.x, canvasSize.y);
  vec2 origin = 0.5 * (canvasSize - vec2(side));
  vec2 boxUV = (screenUV * canvasSize - origin) / side;
  insideBox = step(0.0, boxUV.x) * step(0.0, boxUV.y)
            * step(boxUV.x, 1.0) * step(boxUV.y, 1.0);
  return boxUV;
}

void main(){
  float insideBox;
  vec2 boxUV = boxUVFromScreen(vUV, insideBox);
  if (insideBox < 0.5) {
    fragColor = vec4(0.0);
    return;
  }

  vec4 dacc = max(texture(uDensity, boxUV), vec4(0.0));

  float density = max(max(dacc.r, dacc.g), dacc.b);
  float exposure = uGain * density;
  float v = 1.0 - exp(-exposure);
  v = pow(clamp(v, 0.0, 1.0), uGamma);

  vec3 col = vec3(1.0, 1.0, 0.0);
  float crowded = smoothstep(1., 3.0, exposure);
  float oversaturated = smoothstep(3.0, 5.0, exposure);
  col = mix(col, vec3(1.0, 0.55, 0.08), 0.45 * crowded);
  col = mix(col, vec3(1.0, 0.35, 0.62), 0.30 * oversaturated);

  if (uBlendMode == 0) {
    fragColor = vec4(col, v);
  } else if (uBlendMode == 1) {
    fragColor = vec4(col * v, 1.0);
  } else if (uBlendMode == 2) {
    fragColor = vec4(col * v, 1.0);
  } else {
    fragColor = vec4(col, v);
  }
}
