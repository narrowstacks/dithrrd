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
  it('encodes compact JSON (no newlines) while still round-tripping', () => {
    const param = encodePresetParam(preset)
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const decodedJsonString = new TextDecoder().decode(bytes)
    expect(decodedJsonString).not.toContain('\n')
    expect(JSON.parse(decodedJsonString)).toEqual(preset)
    expect(decodePresetParam(param)).toEqual(preset)
  })
})
