import { describe, it, expect } from 'vitest'
import { duotone } from '@/effects/duotone'
import { paletteUniformKeys } from '@/effects/paletteUniforms'

const ctx = { palettes: { bw: { id: 'bw', name: 'bw', colors: [[0, 0, 0], [1, 1, 1]] as [number, number, number][] } } }

describe('duotone effect', () => {
  it('is a color GPU effect', () => {
    expect(duotone.kind).toBe('gpu')
    expect(duotone.family).toBe('color')
    expect(duotone.type).toBe('duotone')
  })
  it('binds the selected palette to the declared uniform keys', () => {
    const u = duotone.uniforms({ paletteId: 'bw' }, ctx)
    expect(Object.keys(u).sort()).toEqual([...duotone.uniformKeys].sort())
    expect(duotone.uniformKeys).toEqual(paletteUniformKeys())
    expect((u as { uCount: number }).uCount).toBe(2)
  })
  it('falls back to a valid binding for an unknown palette id', () => {
    const u = duotone.uniforms({ paletteId: 'nope' }, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...duotone.uniformKeys].sort())
  })
})
