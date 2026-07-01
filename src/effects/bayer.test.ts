import { describe, it, expect } from 'vitest'
import { bayer } from '@/effects/bayer'

describe('bayer effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = bayer.uniforms(bayer.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...bayer.uniformKeys].sort())
  })
  it("converts the matrix select ('4'/'8') to a numeric uniform", () => {
    expect(bayer.uniforms({ matrix: '4', levels: 2 }, { palettes: {} })).toMatchObject({ uMatrix: 4 })
    expect(bayer.uniforms({ matrix: '8', levels: 2 }, { palettes: {} })).toMatchObject({ uMatrix: 8 })
  })
})
