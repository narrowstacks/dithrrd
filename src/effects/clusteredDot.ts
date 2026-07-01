import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uLevels;

// 8x8 clustered-dot (spiral) threshold matrix, values 0..63.
const float CLUSTER8[64] = float[64](
 24.,10.,12.,26.,35.,47.,49.,37.,
  8., 0., 2.,14.,45.,59.,61.,51.,
 22., 6., 4.,16.,43.,57.,63.,53.,
 30.,20.,18.,28.,33.,41.,55.,39.,
 34.,46.,48.,38.,25.,11.,13.,27.,
 44.,58.,60.,50., 9., 1., 3.,15.,
 42.,56.,62.,52.,23., 7., 5.,17.,
 32.,40.,54.,36.,31.,21.,19.,29.);

void main() {
  ivec2 pix = ivec2(vUv * resolution);
  int x = int(mod(float(pix.x), 8.0));
  int y = int(mod(float(pix.y), 8.0));
  float t = CLUSTER8[y * 8 + x] / 64.0 - 0.5;
  float L = max(uLevels, 2.0);
  vec4 s = texture(src, vUv);
  vec3 c = clamp(s.rgb + t / (L - 1.0), 0.0, 1.0);
  c = floor(c * (L - 1.0) + 0.5) / (L - 1.0);
  fragColor = vec4(c, s.a);
}`

export const clusteredDot: GpuEffect = {
  kind: 'gpu',
  type: 'clusteredDot',
  name: 'Clustered Dot',
  family: 'ordered',
  defaultParams: { levels: 2 },
  controls: [{ type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 }],
  frag: FRAG,
  uniformKeys: ['uLevels'],
  uniforms: (p) => ({ uLevels: Number(p.levels) }),
}
