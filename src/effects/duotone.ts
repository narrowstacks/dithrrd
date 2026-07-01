import type { GpuEffect } from '@/effects/types'
import { PALETTES } from '@/color/palettes'
import {
  paletteUniformKeys, paletteVec3Uniforms, PALETTE_GLSL_DECL, paletteRampGlsl,
} from '@/effects/paletteUniforms'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
${PALETTE_GLSL_DECL}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

${paletteRampGlsl('rampAt')}

void main() {
  vec4 s = texture(src, vUv);
  int n = max(uCount, 2);
  // Luminance walks the ramp in palette-array order: luma 0 -> uP0 (shadow),
  // luma 1 -> uP(n-1) (highlight). Author the palette dark->light for a
  // conventional shadow->highlight ramp.
  float t = clamp(luma(s.rgb), 0.0, 1.0) * float(n - 1);
  int i0 = int(floor(t));
  i0 = clamp(i0, 0, n - 1);
  int i1 = min(i0 + 1, n - 1);
  float f = clamp(t - float(i0), 0.0, 1.0);
  vec3 col = mix(rampAt(i0), rampAt(i1), f);
  fragColor = vec4(col, s.a);
}`

export const duotone: GpuEffect = {
  kind: 'gpu',
  type: 'duotone',
  name: 'Duotone / Multitone',
  family: 'color',
  defaultParams: { paletteId: 'gameboy' },
  controls: [{ type: 'palette', key: 'paletteId', label: 'Ramp' }],
  frag: FRAG,
  uniformKeys: paletteUniformKeys(),
  uniforms: (p, ctx) => {
    const palette = ctx.palettes[String(p.paletteId)] ?? PALETTES.bw
    return paletteVec3Uniforms(palette)
  },
}
