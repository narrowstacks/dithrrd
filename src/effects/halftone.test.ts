import { describe, it, expect } from 'vitest'
import { halftone } from '@/effects/halftone'

describe('halftone effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = halftone.uniforms(halftone.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...halftone.uniformKeys].sort())
  })
  it('converts angle degrees to radians', () => {
    const u = halftone.uniforms({ cellSize: 8, angle: 180 }, { palettes: {} }) as { uAngle: number }
    expect(u.uAngle).toBeCloseTo(Math.PI, 5)
  })
})
