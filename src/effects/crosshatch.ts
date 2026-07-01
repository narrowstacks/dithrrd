import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uCellSize; uniform float uAngle;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// 1 on a thin line (~20% of pitch) along the given angle, else 0.
float lineSet(vec2 p, float ang, float pitch) {
  float u = p.x * cos(ang) + p.y * sin(ang);
  return step(fract(u / pitch), 0.2);
}

void main() {
  float cs = max(uCellSize, 3.0);
  vec2 p = vUv * resolution;
  vec4 srcC = texture(src, vUv);
  float l = luma(srcC.rgb);
  float a = uAngle;
  float ink = 0.0;
  if (l < 0.8) ink = max(ink, lineSet(p, a + 0.7854, cs));   // +45deg
  if (l < 0.6) ink = max(ink, lineSet(p, a - 0.7854, cs));   // -45deg
  if (l < 0.4) ink = max(ink, lineSet(p, a, cs));            // 0deg
  if (l < 0.2) ink = max(ink, lineSet(p, a + 1.5708, cs));   // +90deg
  vec3 col = mix(vec3(1.0), vec3(0.0), ink);
  fragColor = vec4(col, srcC.a);
}`

export const crosshatch: GpuEffect = {
  kind: 'gpu',
  type: 'crosshatch',
  name: 'Crosshatch',
  family: 'halftone',
  defaultParams: { cellSize: 6, angle: 0 },
  controls: [
    { type: 'slider', key: 'cellSize', label: 'Pitch', min: 3, max: 30, step: 1 },
    { type: 'angle', key: 'angle', label: 'Angle' },
  ],
  frag: FRAG,
  uniformKeys: ['uCellSize', 'uAngle'],
  uniforms: (p) => ({
    uCellSize: Number(p.cellSize),
    uAngle: (Number(p.angle) * Math.PI) / 180,
  }),
}
