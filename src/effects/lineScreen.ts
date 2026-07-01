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
  // coordinate along the screen axis
  float v = -p.x * s + p.y * co;
  // triangle wave 0..1 across each line pitch (0 at line center)
  float band = abs(fract(v / cs) - 0.5) * 2.0;
  vec4 srcC = texture(src, vUv);
  float l = luma(srcC.rgb);
  // darker -> wider inked band; anti-alias over ~2px expressed in band units
  float thr = 1.0 - l;
  float aa = 2.0 / cs;
  float ink = 1.0 - smoothstep(thr - aa, thr + aa, band);
  vec3 col = mix(vec3(1.0), vec3(0.0), ink);
  fragColor = vec4(col, srcC.a);
}`

export const lineScreen: GpuEffect = {
  kind: 'gpu',
  type: 'lineScreen',
  name: 'Line Screen',
  family: 'halftone',
  defaultParams: { cellSize: 8, angle: 45 },
  controls: [
    { type: 'slider', key: 'cellSize', label: 'Pitch', min: 2, max: 40, step: 1 },
    { type: 'angle', key: 'angle', label: 'Angle' },
  ],
  frag: FRAG,
  uniformKeys: ['uCellSize', 'uAngle'],
  uniforms: (p) => ({
    uCellSize: Number(p.cellSize),
    uAngle: (Number(p.angle) * Math.PI) / 180,
  }),
}
