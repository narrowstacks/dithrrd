import { describe, it, expect } from 'vitest'
import { buildPreset, presetToJson, parsePresetJson } from '@/features/preset'
import type { StackNode } from '@/engine/planPasses'
import type { Palette } from '@/effects/types'

const custom: Palette = { id: 'c1', name: 'Mine', colors: [[1, 0, 0], [0, 0, 1]] }
const palettes: Record<string, Palette> = {
  bw: { id: 'bw', name: 'B&W', colors: [[0, 0, 0], [1, 1, 1]] }, // built-in
  c1: custom,
}
const stack: StackNode[] = [
  { id: 'n1', type: 'duotone', enabled: true, params: { paletteId: 'c1' } },
  { id: 'n2', type: 'palette', enabled: true, params: { paletteId: 'bw' } },
  { id: 'n3', type: 'bayer', enabled: false, params: { matrix: '4', levels: 2 } },
]

describe('preset core', () => {
  it('embeds only the custom palettes referenced by the stack', () => {
    const preset = buildPreset(stack, palettes)
    expect(preset.v).toBe(1)
    expect(preset.palettes).toEqual([custom]) // c1 referenced; bw is built-in -> excluded
    expect(preset.stack).toHaveLength(3)
  })
  it('deep-clones the stack (no shared references)', () => {
    const preset = buildPreset(stack, palettes)
    expect(preset.stack[0]).not.toBe(stack[0])
    expect(preset.stack[0].params).not.toBe(stack[0].params)
    expect(preset.stack[0].params).toEqual({ paletteId: 'c1' })
  })
  it('round-trips through JSON', () => {
    const preset = buildPreset(stack, palettes)
    expect(parsePresetJson(presetToJson(preset))).toEqual(preset)
  })
  it('throws on structurally invalid JSON', () => {
    expect(() => parsePresetJson('not json')).toThrow()
    expect(() => parsePresetJson('{"v":1}')).toThrow() // missing stack/palettes
    expect(() => parsePresetJson(JSON.stringify({ v: 1, stack: 'x', palettes: [] }))).toThrow()
  })
  it('preserves unknown effect types (forward-compat)', () => {
    const p = { v: 1, stack: [{ id: 'x', type: 'future-fx', enabled: true, params: {} }], palettes: [] }
    expect(parsePresetJson(JSON.stringify(p)).stack[0].type).toBe('future-fx')
  })
})
