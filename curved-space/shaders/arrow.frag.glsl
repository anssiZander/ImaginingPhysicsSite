#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
uniform vec3 uEye;
uniform vec3 uLight;
uniform vec4 uColor;
uniform vec4 uMaterial;
out vec4 outColor;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDirection = normalize(uLight);
  vec3 viewDirection = normalize(uEye - vPosition);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  vec3 halfway = normalize(lightDirection + viewDirection);
  float specular = pow(max(dot(normal, halfway), 0.0), uMaterial.w) * step(0.0, dot(normal, lightDirection));
  vec3 color = uColor.rgb * (uMaterial.x + uMaterial.y * diffuse);
  color += vec3(1.0, 0.97, 0.88) * uMaterial.z * specular;
  outColor = vec4(color, uColor.a);
}
