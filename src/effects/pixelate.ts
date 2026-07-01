import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uPixelSize; uniform float uLevels;
void main() {
  float ps = max(uPixelSize, 1.0);
  vec2 cell = ps / resolution;
  vec2 uv = (floor(vUv / cell) + 0.5) * cell;
  vec3 c = texture(src, uv).rgb;
  float L = max(uLevels, 2.0);
  c = floor(c * (L - 1.0) + 0.5) / (L - 1.0);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

export const pixelate: GpuEffect = {
  kind: 'gpu',
  type: 'pixelate',
  name: 'Pixelate + Posterize',
  family: 'pixelate',
  defaultParams: { pixelSize: 4, levels: 4 },
  controls: [
    { type: 'slider', key: 'pixelSize', label: 'Pixel Size', min: 1, max: 64, step: 1 },
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 16, step: 1 },
  ],
  frag: FRAG,
  uniformKeys: ['uPixelSize', 'uLevels'],
  uniforms: (p) => ({ uPixelSize: Number(p.pixelSize), uLevels: Number(p.levels) }),
}
