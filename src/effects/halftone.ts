import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uCellSize; uniform float uAngle;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  float cs = max(uCellSize, 2.0);
  vec2 p = vUv * resolution;
  float s = sin(uAngle), co = cos(uAngle);
  mat2 R = mat2(co, -s, s, co);
  mat2 Rt = mat2(co, s, -s, co); // inverse rotation
  vec2 rp = R * p;
  vec2 cellCenterR = (floor(rp / cs) + 0.5) * cs;
  vec2 center = Rt * cellCenterR;
  vec4 srcCell = texture(src, clamp(center / resolution, 0.0, 1.0));
  float l = luma(srcCell.rgb);
  float radius = (1.0 - l) * 0.5 * cs * 1.20;
  float d = distance(p, center);
  float dot_ = smoothstep(radius + 1.0, radius - 1.0, d);
  vec3 col = mix(vec3(1.0), vec3(0.0), dot_);
  fragColor = vec4(col, srcCell.a);
}`

export const halftone: GpuEffect = {
  kind: 'gpu',
  type: 'halftone',
  name: 'Halftone',
  family: 'halftone',
  defaultParams: { cellSize: 8, angle: 45 },
  controls: [
    { type: 'slider', key: 'cellSize', label: 'Cell Size', min: 2, max: 40, step: 1 },
    { type: 'angle', key: 'angle', label: 'Angle' },
  ],
  frag: FRAG,
  uniformKeys: ['uCellSize', 'uAngle'],
  uniforms: (p) => ({
    uCellSize: Number(p.cellSize),
    uAngle: (Number(p.angle) * Math.PI) / 180,
  }),
}
