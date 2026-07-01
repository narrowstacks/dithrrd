import { describe, it, expect } from 'vitest'
import { crosshatch } from '@/effects/crosshatch'

describe('crosshatch effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = crosshatch.uniforms(crosshatch.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...crosshatch.uniformKeys].sort())
  })
  it('converts angle degrees to radians', () => {
    const u = crosshatch.uniforms({ cellSize: 6, angle: 90 }, { palettes: {} }) as { uAngle: number }
    expect(u.uAngle).toBeCloseTo(Math.PI / 2, 5)
  })
  it('is a halftone GPU effect', () => {
    expect(crosshatch.kind).toBe('gpu')
    expect(crosshatch.family).toBe('halftone')
  })
})
