import { describe, it, expect } from 'vitest'
import {
  PALETTE_MAX, paletteUniformKeys, paletteVec3Uniforms,
} from '@/effects/paletteUniforms'
import type { Palette } from '@/effects/types'

describe('paletteUniforms', () => {
  it('exposes 16 + count keys', () => {
    const keys = paletteUniformKeys()
    expect(keys).toHaveLength(PALETTE_MAX + 1)
    expect(keys).toContain('uP0')
    expect(keys).toContain('uP15')
    expect(keys).toContain('uCount')
  })
  it('binds colors to uP slots with uCount, padding missing slots with black', () => {
    const p: Palette = { id: 'x', name: 'x', colors: [[1, 0, 0], [0, 1, 0]] }
    const u = paletteVec3Uniforms(p) as Record<string, unknown>
    expect(u.uCount).toBe(2)
    expect(u.uP0).toEqual([1, 0, 0])
    expect(u.uP1).toEqual([0, 1, 0])
    expect(u.uP2).toEqual([0, 0, 0])
    expect(Object.keys(u).sort()).toEqual([...paletteUniformKeys()].sort())
  })
  it('clamps uCount to PALETTE_MAX', () => {
    const many: Palette = { id: 'y', name: 'y', colors: Array.from({ length: 20 }, () => [1, 1, 1] as [number, number, number]) }
    expect((paletteVec3Uniforms(many) as { uCount: number }).uCount).toBe(PALETTE_MAX)
  })
})
