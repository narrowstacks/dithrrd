import { describe, it, expect } from 'vitest'
import { encodePresetParam, decodePresetParam } from '@/features/presetUrl'
import type { Preset } from '@/features/preset'

const preset: Preset = {
  v: 1,
  stack: [{ id: 'n1', type: 'duotone', enabled: true, params: { paletteId: 'c1' } }],
  palettes: [{ id: 'c1', name: 'Sűnset ✦', colors: [[1, 0, 0], [0, 0, 1]] }], // unicode name
}

describe('presetUrl', () => {
  it('round-trips a preset (incl. unicode) through the URL param', () => {
    const param = encodePresetParam(preset)
    expect(param).not.toMatch(/[+/=]/) // url-safe, unpadded
    expect(decodePresetParam(param)).toEqual(preset)
  })
  it('throws on a corrupt param', () => {
    expect(() => decodePresetParam('!!!not-base64!!!')).toThrow()
  })
})
