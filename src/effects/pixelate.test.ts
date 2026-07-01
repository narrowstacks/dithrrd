import { describe, it, expect } from 'vitest'
import { pixelate } from '@/effects/pixelate'

describe('pixelate effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = pixelate.uniforms(pixelate.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...pixelate.uniformKeys].sort())
  })
  it('passes pixel size and levels through', () => {
    expect(pixelate.uniforms({ pixelSize: 6, levels: 4, sampling: 'nearest', dither: false }, { palettes: {} }))
      .toMatchObject({ uPixelSize: 6, uLevels: 4 })
  })
  it('encodes sampling mode and dither toggle as 0/1 floats', () => {
    expect(pixelate.uniforms({ pixelSize: 4, levels: 4, sampling: 'nearest', dither: false }, { palettes: {} }))
      .toMatchObject({ uSampling: 0, uDither: 0 })
    expect(pixelate.uniforms({ pixelSize: 4, levels: 4, sampling: 'average', dither: true }, { palettes: {} }))
      .toMatchObject({ uSampling: 1, uDither: 1 })
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(pixelate.controls.map((c) => c.key))
    for (const k of Object.keys(pixelate.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
