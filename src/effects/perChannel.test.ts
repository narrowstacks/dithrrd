import { describe, it, expect } from 'vitest'
import { perChannel } from '@/effects/perChannel'

describe('perChannel effect', () => {
  it('is an ordered GPU effect', () => {
    expect(perChannel.kind).toBe('gpu')
    expect(perChannel.family).toBe('ordered')
    expect(perChannel.type).toBe('perChannel')
  })
  it('maps params to the declared uniform keys', () => {
    const u = perChannel.uniforms(perChannel.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...perChannel.uniformKeys].sort())
  })
  it('converts the angle to radians and passes levels/scale through', () => {
    const u = perChannel.uniforms({ levels: 4, angle: 180, scale: 3 }, { palettes: {} }) as {
      uLevels: number; uAngle: number; uScale: number
    }
    expect(u.uLevels).toBe(4)
    expect(u.uScale).toBe(3)
    expect(u.uAngle).toBeCloseTo(Math.PI, 5)
  })
})
