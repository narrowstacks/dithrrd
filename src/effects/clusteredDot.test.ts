import { describe, it, expect } from 'vitest'
import { clusteredDot } from '@/effects/clusteredDot'

describe('clusteredDot effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = clusteredDot.uniforms(clusteredDot.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...clusteredDot.uniformKeys].sort())
  })
  it('passes levels through', () => {
    expect(clusteredDot.uniforms({ levels: 3 }, { palettes: {} })).toMatchObject({ uLevels: 3 })
  })
  it('is an ordered GPU effect', () => {
    expect(clusteredDot.kind).toBe('gpu')
    expect(clusteredDot.family).toBe('ordered')
  })
})
