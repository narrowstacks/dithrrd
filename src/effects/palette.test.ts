import { describe, it, expect } from 'vitest'
import { paletteEffect } from '@/effects/palette'
import { PALETTES } from '@/color/palettes'

describe('palette effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = paletteEffect.uniforms(paletteEffect.defaultParams, { palettes: PALETTES })
    expect(Object.keys(u).sort()).toEqual([...paletteEffect.uniformKeys].sort())
  })
  it('flattens the selected palette into a 48-length array with a count', () => {
    const u = paletteEffect.uniforms({ paletteId: 'bw' }, { palettes: PALETTES }) as {
      uPalette: number[]; uCount: number
    }
    expect(u.uCount).toBe(2)
    expect(u.uPalette).toHaveLength(48)
    expect(u.uPalette.slice(0, 6)).toEqual([0, 0, 0, 1, 1, 1])
  })
  it('falls back to bw when the palette id is unknown', () => {
    const u = paletteEffect.uniforms({ paletteId: 'nope' }, { palettes: PALETTES }) as { uCount: number }
    expect(u.uCount).toBe(2)
  })
})
