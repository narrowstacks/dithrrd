import { describe, it, expect } from 'vitest'
import { lineScreen } from '@/effects/lineScreen'

describe('lineScreen effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = lineScreen.uniforms(lineScreen.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...lineScreen.uniformKeys].sort())
  })
  it('converts angle degrees to radians', () => {
    const u = lineScreen.uniforms({ cellSize: 8, angle: 180 }, { palettes: {} }) as { uAngle: number }
    expect(u.uAngle).toBeCloseTo(Math.PI, 5)
  })
  it('is a halftone GPU effect', () => {
    expect(lineScreen.kind).toBe('gpu')
    expect(lineScreen.family).toBe('halftone')
  })
})
