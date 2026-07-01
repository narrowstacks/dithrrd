import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uLevels; uniform float uMatrix;

const float BAYER4[16] = float[16](
  0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
const float BAYER8[64] = float[64](
  0.,32.,8.,40.,2.,34.,10.,42., 48.,16.,56.,24.,50.,18.,58.,26.,
  12.,44.,4.,36.,14.,46.,6.,38., 60.,28.,52.,20.,62.,30.,54.,22.,
  3.,35.,11.,43.,1.,33.,9.,41., 51.,19.,59.,27.,49.,17.,57.,25.,
  15.,47.,7.,39.,13.,45.,5.,37., 63.,31.,55.,23.,61.,29.,53.,21.);

float threshold(ivec2 p) {
  if (uMatrix > 7.0) {
    int x = int(mod(float(p.x), 8.0)); int y = int(mod(float(p.y), 8.0));
    return BAYER8[y * 8 + x] / 64.0 - 0.5;
  }
  int x = int(mod(float(p.x), 4.0)); int y = int(mod(float(p.y), 4.0));
  return BAYER4[y * 4 + x] / 16.0 - 0.5;
}

void main() {
  ivec2 pix = ivec2(vUv * resolution);
  float t = threshold(pix);
  float L = max(uLevels, 2.0);
  vec3 c = texture(src, vUv).rgb;
  c = clamp(c + t / (L - 1.0), 0.0, 1.0);
  c = floor(c * (L - 1.0) + 0.5) / (L - 1.0);
  fragColor = vec4(c, texture(src, vUv).a);
}`

export const bayer: GpuEffect = {
  kind: 'gpu',
  type: 'bayer',
  name: 'Bayer Dither',
  family: 'ordered',
  defaultParams: { matrix: '4', levels: 2 },
  controls: [
    { type: 'select', key: 'matrix', label: 'Matrix', options: [
      { label: '4 × 4', value: '4' }, { label: '8 × 8', value: '8' },
    ] },
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
  ],
  frag: FRAG,
  uniformKeys: ['uLevels', 'uMatrix'],
  uniforms: (p) => ({
    uLevels: Number(p.levels),
    uMatrix: p.matrix === '8' ? 8 : 4,
  }),
}
