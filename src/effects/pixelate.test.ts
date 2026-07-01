import { describe, it, expect } from 'vitest'
import { pixelate } from '@/effects/pixelate'

describe('pixelate effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = pixelate.uniforms(pixelate.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...pixelate.uniformKeys].sort())
  })
  it('passes pixel size and levels through', () => {
    expect(pixelate.uniforms({ pixelSize: 6, levels: 4 }, { palettes: {} }))
      .toMatchObject({ uPixelSize: 6, uLevels: 4 })
  })
})
