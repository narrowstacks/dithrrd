import type { Palette } from '@/effects/types'

export const PALETTE_MAX = 16

export function paletteUniformKeys(): string[] {
  return [...Array.from({ length: PALETTE_MAX }, (_, i) => `uP${i}`), 'uCount']
}

export function paletteVec3Uniforms(palette: Palette): Record<string, unknown> {
  const u: Record<string, unknown> = { uCount: Math.min(palette.colors.length, PALETTE_MAX) }
  for (let i = 0; i < PALETTE_MAX; i++) {
    const c = palette.colors[i]
    u[`uP${i}`] = c ? [c[0], c[1], c[2]] : [0, 0, 0]
  }
  return u
}

/** GLSL declarations for the 16 individual palette vec3 uniforms + count. */
export const PALETTE_GLSL_DECL = `
uniform vec3 uP0; uniform vec3 uP1; uniform vec3 uP2; uniform vec3 uP3;
uniform vec3 uP4; uniform vec3 uP5; uniform vec3 uP6; uniform vec3 uP7;
uniform vec3 uP8; uniform vec3 uP9; uniform vec3 uP10; uniform vec3 uP11;
uniform vec3 uP12; uniform vec3 uP13; uniform vec3 uP14; uniform vec3 uP15;
uniform int uCount;`

/** GLSL: `vec3 <fnName>(int idx)` returning the idx-th palette color (unrolled). */
export function paletteRampGlsl(fnName: string): string {
  const lines = Array.from({ length: PALETTE_MAX }, (_, i) => `  if (idx <= ${i}) return uP${i};`)
  return `vec3 ${fnName}(int idx) {\n${lines.join('\n')}\n  return uP15;\n}`
}
