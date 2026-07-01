import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uPixelSize; uniform float uLevels;
uniform float uSampling; // 0 = nearest cell center, 1 = 4-tap box average
uniform float uDither;    // 0 = off, 1 = ordered dither before quantize

const float BAYER4[16] = float[16](
  0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);

void main() {
  float ps = max(uPixelSize, 1.0);
  vec2 cell = ps / resolution;
  vec2 base = floor(vUv / cell) * cell;
  vec2 centerUv = base + cell * 0.5;

  vec3 c;
  if (uSampling > 0.5) {
    // 4-tap box average across the cell (approximate downsample)
    vec2 q = cell * 0.25;
    c = ( texture(src, base + q).rgb
        + texture(src, base + vec2(q.x, cell.y - q.y)).rgb
        + texture(src, base + vec2(cell.x - q.x, q.y)).rgb
        + texture(src, base + cell - q).rgb ) * 0.25;
  } else {
    c = texture(src, centerUv).rgb;
  }

  float L = max(uLevels, 2.0);
  if (uDither > 0.5) {
    // Bayer offset is sampled at screen-pixel resolution (not per cell) on purpose:
    // it breaks posterize banding with fine sub-block texture rather than checkerboarding
    // whole blocks. Index by cell (floor(vUv/cell)) instead if a flat pixel-art look is wanted.
    ivec2 pix = ivec2(vUv * resolution);
    int x = int(mod(float(pix.x), 4.0));
    int y = int(mod(float(pix.y), 4.0));
    float t = BAYER4[y * 4 + x] / 16.0 - 0.5;
    c = clamp(c + t / (L - 1.0), 0.0, 1.0);
  }
  c = floor(c * (L - 1.0) + 0.5) / (L - 1.0);
  fragColor = vec4(clamp(c, 0.0, 1.0), texture(src, centerUv).a);
}`

export const pixelate: GpuEffect = {
  kind: 'gpu',
  type: 'pixelate',
  name: 'Pixelate + Posterize',
  family: 'pixelate',
  defaultParams: { pixelSize: 4, levels: 4, sampling: 'nearest', dither: false },
  controls: [
    { type: 'slider', key: 'pixelSize', label: 'Pixel Size', min: 1, max: 64, step: 1 },
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 16, step: 1 },
    { type: 'select', key: 'sampling', label: 'Sampling', options: [
      { label: 'Nearest', value: 'nearest' }, { label: 'Average', value: 'average' },
    ] },
    { type: 'toggle', key: 'dither', label: 'Dither before quantize' },
  ],
  frag: FRAG,
  uniformKeys: ['uPixelSize', 'uLevels', 'uSampling', 'uDither'],
  uniforms: (p) => ({
    uPixelSize: Number(p.pixelSize),
    uLevels: Number(p.levels),
    uSampling: p.sampling === 'average' ? 1 : 0,
    uDither: p.dither ? 1 : 0,
  }),
}
