import type { GpuEffect, Palette } from '@/effects/types'
import { PALETTES } from '@/color/palettes'

const MAX = 16

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform vec3 uPalette[${MAX}];
uniform int uCount;
void main() {
  vec3 c = texture(src, vUv).rgb;
  float best = 1e9; vec3 pick = c;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    vec3 d = c - uPalette[i];
    float dist = dot(d, d);
    if (dist < best) { best = dist; pick = uPalette[i]; }
  }
  fragColor = vec4(pick, 1.0);
}`

function flatten(palette: Palette): { uPalette: number[]; uCount: number } {
  const out = new Array(MAX * 3).fill(0)
  const n = Math.min(palette.colors.length, MAX)
  for (let i = 0; i < n; i++) {
    out[i * 3] = palette.colors[i][0]
    out[i * 3 + 1] = palette.colors[i][1]
    out[i * 3 + 2] = palette.colors[i][2]
  }
  return { uPalette: out, uCount: n }
}

export const paletteEffect: GpuEffect = {
  kind: 'gpu',
  type: 'palette',
  name: 'Palette Map',
  family: 'color',
  defaultParams: { paletteId: 'gameboy' },
  controls: [
    { type: 'palette', key: 'paletteId', label: 'Palette' },
  ],
  frag: FRAG,
  uniformKeys: ['uPalette', 'uCount'],
  uniforms: (p, ctx) => {
    const palette = ctx.palettes[String(p.paletteId)] ?? PALETTES.bw
    return flatten(palette)
  },
}
