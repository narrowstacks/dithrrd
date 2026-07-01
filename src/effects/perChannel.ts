import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uLevels; uniform float uAngle; uniform float uScale;

const float BAYER4[16] = float[16](
  0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);

// Ordered threshold in -0.5..0.5 at integer grid position p.
float threshAt(vec2 p) {
  ivec2 q = ivec2(floor(p));
  int x = int(mod(float(q.x), 4.0));
  int y = int(mod(float(q.y), 4.0));
  return BAYER4[y * 4 + x] / 16.0 - 0.5;
}

vec2 rot(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c) * p;
}

float quant(float v, float t, float L) {
  v = clamp(v + t / (L - 1.0), 0.0, 1.0);
  return floor(v * (L - 1.0) + 0.5) / (L - 1.0);
}

void main() {
  vec4 s = texture(src, vUv);
  float L = max(uLevels, 2.0);
  vec2 p = (vUv * resolution) / max(uScale, 1.0);
  // classic screen angles offset per channel from the base angle
  float tr = threshAt(rot(p, uAngle + 0.2618));  // +15 deg
  float tg = threshAt(rot(p, uAngle + 1.3090));  // +75 deg
  float tb = threshAt(rot(p, uAngle));           //   0 deg
  vec3 c = vec3(
    quant(s.r, tr, L),
    quant(s.g, tg, L),
    quant(s.b, tb, L)
  );
  fragColor = vec4(c, s.a);
}`

export const perChannel: GpuEffect = {
  kind: 'gpu',
  type: 'perChannel',
  name: 'Per-Channel (CMYK)',
  family: 'ordered',
  defaultParams: { levels: 2, angle: 0, scale: 1 },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'angle', key: 'angle', label: 'Angle' },
    { type: 'slider', key: 'scale', label: 'Dot Scale', min: 1, max: 8, step: 1 },
  ],
  frag: FRAG,
  uniformKeys: ['uLevels', 'uAngle', 'uScale'],
  uniforms: (p) => ({
    uLevels: Number(p.levels),
    uAngle: (Number(p.angle) * Math.PI) / 180,
    uScale: Number(p.scale),
  }),
}
