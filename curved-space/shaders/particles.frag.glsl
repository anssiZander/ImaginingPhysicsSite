#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec3 vColor;
uniform vec3 uEye;
uniform vec3 uLight;
uniform vec4 uMaterial;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal), l = normalize(uLight), v = normalize(uEye - vPosition);
  float diffuse = max(dot(n, l), 0.0);
  float specular = diffuse > 0.0 ? pow(max(dot(n, normalize(l + v)), 0.0), uMaterial.w) : 0.0;
  vec3 color = vColor * (uMaterial.x + uMaterial.y * diffuse) + vec3(specular * uMaterial.z);
  outColor = vec4(color, 1.0);
}
