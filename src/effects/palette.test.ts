import { describe, it, expect } from 'vitest'
import { paletteEffect } from '@/effects/palette'
import { PALETTES } from '@/color/palettes'

describe('palette effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = paletteEffect.uniforms(paletteEffect.defaultParams, { palettes: PALETTES })
    expect(Object.keys(u).sort()).toEqual([...paletteEffect.uniformKeys].sort())
  })
  it('emits one vec3 per palette slot (bw: black, white, then padding) with a count', () => {
    const u = paletteEffect.uniforms({ paletteId: 'bw' }, { palettes: PALETTES }) as Record<string, unknown>
    expect(u.uCount).toBe(2)
    expect(u.uP0).toEqual([0, 0, 0]) // black
    expect(u.uP1).toEqual([1, 1, 1]) // white
    expect(u.uP2).toEqual([0, 0, 0]) // unused slot padded
    expect(u.uP15).toEqual([0, 0, 0])
  })
  it('falls back to bw when the palette id is unknown', () => {
    const u = paletteEffect.uniforms({ paletteId: 'nope' }, { palettes: PALETTES }) as { uCount: number }
    expect(u.uCount).toBe(2)
  })
})
