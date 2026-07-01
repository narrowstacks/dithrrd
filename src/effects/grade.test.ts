import { describe, it, expect } from 'vitest'
import { grade } from '@/effects/grade'

describe('grade effect', () => {
  it('maps params to the declared uniform keys', () => {
    const u = grade.uniforms(grade.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...grade.uniformKeys].sort())
  })
  it('passes numeric params straight through', () => {
    const u = grade.uniforms({ brightness: 0.2, contrast: 1.1, gamma: 0.9, saturation: 1.5 }, { palettes: {} })
    expect(u).toMatchObject({ uBrightness: 0.2, uContrast: 1.1, uGamma: 0.9, uSaturation: 1.5 })
  })
})
