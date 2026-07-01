import { describe, it, expect } from 'vitest'
import { paletteToJson, parsePaletteJson } from '@/features/paletteFile'
import type { Palette } from '@/effects/types'

const p: Palette = { id: 'x', name: 'Duo', colors: [[0, 0, 0], [1, 1, 1]] }

describe('paletteFile', () => {
  it('serializes name + colors (omitting id) and round-trips', () => {
    const json = paletteToJson(p)
    expect(JSON.parse(json)).toEqual({ name: 'Duo', colors: [[0, 0, 0], [1, 1, 1]] })
    expect(parsePaletteJson(json)).toEqual({ name: 'Duo', colors: [[0, 0, 0], [1, 1, 1]] })
  })
  it('throws on invalid shape', () => {
    expect(() => parsePaletteJson('{"name":"x"}')).toThrow()
    expect(() => parsePaletteJson('not json')).toThrow()
  })
  it('clamps to 16 colors', () => {
    const many = { name: 'big', colors: Array.from({ length: 20 }, () => [0, 0, 0]) }
    expect(parsePaletteJson(JSON.stringify(many)).colors).toHaveLength(16)
  })
})
