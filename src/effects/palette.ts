import type { GpuEffect, Palette } from '@/effects/types'
import { PALETTES } from '@/color/palettes'

const MAX = 16

// regl binds array uniforms (`vec3 uPalette[16]`) inconsistently; individual named
// vec3 uniforms bind reliably (same path as every other effect's uniforms). So we
// declare uP0..uP15 explicitly and pick the nearest via an unrolled comparison.
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform vec3 uP0; uniform vec3 uP1; uniform vec3 uP2; uniform vec3 uP3;
uniform vec3 uP4; uniform vec3 uP5; uniform vec3 uP6; uniform vec3 uP7;
uniform vec3 uP8; uniform vec3 uP9; uniform vec3 uP10; uniform vec3 uP11;
uniform vec3 uP12; uniform vec3 uP13; uniform vec3 uP14; uniform vec3 uP15;
uniform int uCount;
void main() {
  vec3 c = texture(src, vUv).rgb;
  float best = 1e9; vec3 pick = c;
  #define CONSIDER(IDX, U) if (IDX < uCount) { vec3 d = c - U; float dd = dot(d, d); if (dd < best) { best = dd; pick = U; } }
  CONSIDER(0, uP0) CONSIDER(1, uP1) CONSIDER(2, uP2) CONSIDER(3, uP3)
  CONSIDER(4, uP4) CONSIDER(5, uP5) CONSIDER(6, uP6) CONSIDER(7, uP7)
  CONSIDER(8, uP8) CONSIDER(9, uP9) CONSIDER(10, uP10) CONSIDER(11, uP11)
  CONSIDER(12, uP12) CONSIDER(13, uP13) CONSIDER(14, uP14) CONSIDER(15, uP15)
  #undef CONSIDER
  fragColor = vec4(pick, 1.0);
}`

const PALETTE_KEYS = Array.from({ length: MAX }, (_, i) => `uP${i}`)

function paletteUniforms(palette: Palette): Record<string, unknown> {
  const u: Record<string, unknown> = { uCount: Math.min(palette.colors.length, MAX) }
  for (let i = 0; i < MAX; i++) {
    const c = palette.colors[i]
    u[`uP${i}`] = c ? [c[0], c[1], c[2]] : [0, 0, 0]
  }
  return u
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
  uniformKeys: [...PALETTE_KEYS, 'uCount'],
  uniforms: (p, ctx) => {
    const palette = ctx.palettes[String(p.paletteId)] ?? PALETTES.bw
    return paletteUniforms(palette)
  },
}
