import { describe, it, expect } from 'vitest'
import { encodePresetParam, decodePresetParam } from '@/features/presetUrl'
import type { Preset } from '@/features/preset'
import type { ParamValue } from '@/effects/types'
import { EFFECT_LIST } from '@/effects/registry'

describe('preset URL v2 format', () => {
  it('encodes a node at its defaults as just the version and type code', () => {
    const preset: Preset = {
      v: 1,
      stack: [{ id: 'whatever', type: 'bayer', enabled: true, params: { matrix: '4', levels: 2 } }],
      palettes: [],
    }
    expect(encodePresetParam(preset)).toBe('2~by')
  })

  it('drops trailing default params, keeping only what differs', () => {
    const preset: Preset = {
      v: 1,
      // defaults: pixelSize 4, levels 4, sampling 'nearest', dither false
      stack: [{
        id: 'n', type: 'pixelate', enabled: true,
        params: { pixelSize: 6, levels: 4, sampling: 'nearest', dither: false },
      }],
      palettes: [],
    }
    expect(encodePresetParam(preset)).toBe('2~px-6')
  })

  it('leaves an empty field for a default param that sits before a changed one', () => {
    const preset: Preset = {
      v: 1,
      // defaults: brightness 0, contrast 1, gamma 1, saturation 1 — gamma stays default
      stack: [{
        id: 'n', type: 'grade', enabled: true,
        params: { brightness: 0.12, contrast: 1.35, gamma: 1, saturation: 0.8 },
      }],
      palettes: [],
    }
    expect(encodePresetParam(preset)).toBe('2~gr-0.12-1.35--0.8')
  })

  it('marks a disabled node by prefixing its type code with x', () => {
    const preset: Preset = {
      v: 1,
      stack: [{ id: 'n', type: 'bayer', enabled: false, params: { matrix: '8', levels: 2 } }],
      palettes: [],
    }
    expect(encodePresetParam(preset)).toBe('2~xby-8')
  })

  it('encodes a negative number with an n prefix so it cannot split fields', () => {
    const preset: Preset = {
      v: 1,
      stack: [{
        id: 'n', type: 'grade', enabled: true,
        params: { brightness: -0.25, contrast: 1, gamma: 1, saturation: 1 },
      }],
      palettes: [],
    }
    expect(encodePresetParam(preset)).toBe('2~gr-n0.25')
  })

  it('packs a custom palette as an escaped name plus hex colors, referenced by index', () => {
    const preset: Preset = {
      v: 1,
      stack: [{ id: 'n', type: 'duotone', enabled: true, params: { paletteId: 'c1' } }],
      palettes: [{ id: 'c1', name: 'Custom 1', colors: [[1, 0, 0], [0, 0, 1]] }],
    }
    expect(encodePresetParam(preset)).toBe('2~du-0~Custom.201-ff00000000ff')
  })

  it('keeps a built-in palette id literal rather than treating it as an index', () => {
    const preset: Preset = {
      v: 1,
      stack: [{ id: 'n', type: 'palette', enabled: true, params: { paletteId: 'bw' } }],
      palettes: [],
    }
    expect(encodePresetParam(preset)).toBe('2~pa-bw')
  })

  it('decodes a bare type code back to a node at its defaults', () => {
    expect(decodePresetParam('2~by')).toEqual({
      v: 1,
      stack: [{ id: 'n0', type: 'bayer', enabled: true, params: { matrix: '4', levels: 2 } }],
      palettes: [],
    })
  })

  it('round-trips every registered effect at its defaults', () => {
    const preset: Preset = {
      v: 1,
      stack: EFFECT_LIST.map((e, i) => ({
        id: `x${i}`, type: e.type, enabled: true, params: structuredClone(e.defaultParams),
      })),
      palettes: [],
    }
    const back = decodePresetParam(encodePresetParam(preset))
    expect(back.stack.map((n) => n.type)).toEqual(EFFECT_LIST.map((e) => e.type))
    expect(back.stack.map((n) => n.params)).toEqual(EFFECT_LIST.map((e) => e.defaultParams))
  })

  it('round-trips every non-default param value of every effect', () => {
    for (const effect of EFFECT_LIST) {
      for (const [key, value] of Object.entries(effect.defaultParams)) {
        // Something that is definitely not the default, per param type.
        const changed: ParamValue =
          typeof value === 'number' ? value + 1.5
          : typeof value === 'boolean' ? !value
          : `${value}zz`
        const preset: Preset = {
          v: 1,
          stack: [{
            id: 'n', type: effect.type, enabled: true,
            params: { ...structuredClone(effect.defaultParams), [key]: changed },
          }],
          palettes: [],
        }
        const back = decodePresetParam(encodePresetParam(preset))
        expect(back.stack[0].params[key], `${effect.type}.${key}`).toEqual(changed)
      }
    }
  })

  it('round-trips a disabled node', () => {
    const preset: Preset = {
      v: 1,
      stack: [
        { id: 'a', type: 'grade', enabled: false, params: { brightness: 0, contrast: 1, gamma: 1, saturation: 1 } },
        { id: 'b', type: 'bayer', enabled: true, params: { matrix: '4', levels: 2 } },
      ],
      palettes: [],
    }
    const back = decodePresetParam(encodePresetParam(preset))
    expect(back.stack.map((n) => n.enabled)).toEqual([false, true])
  })

  it('round-trips a custom palette and repoints the node that referenced it', () => {
    const preset: Preset = {
      v: 1,
      stack: [
        { id: 'a', type: 'palette', enabled: true, params: { paletteId: 'old-uuid' } },
        { id: 'b', type: 'duotone', enabled: true, params: { paletteId: 'gameboy' } },
      ],
      palettes: [{ id: 'old-uuid', name: 'Sűnset ✦', colors: [[1, 0, 0], [0.5, 0.25, 0]] }],
    }
    const back = decodePresetParam(encodePresetParam(preset))

    expect(back.palettes).toHaveLength(1)
    expect(back.palettes[0].name).toBe('Sűnset ✦') // unicode survives
    expect(back.palettes[0].colors[0]).toEqual([1, 0, 0])
    expect(back.palettes[0].id).not.toBe('old-uuid') // fresh id, can't clobber the recipient's
    expect(back.stack[0].params.paletteId).toBe(back.palettes[0].id) // ...and the ref follows it
    expect(back.stack[1].params.paletteId).toBe('gameboy') // built-in ref untouched
  })

  it('refuses to encode a colorless palette rather than emit an unopenable link', () => {
    const preset: Preset = {
      v: 1,
      stack: [{ id: 'n', type: 'palette', enabled: true, params: { paletteId: 'c1' } }],
      palettes: [{ id: 'c1', name: 'Empty', colors: [] }],
    }
    expect(() => encodePresetParam(preset)).toThrow(/no colors/)
  })

  it('round-trips an empty stack', () => {
    const back = decodePresetParam(encodePresetParam({ v: 1, stack: [], palettes: [] }))
    expect(back).toEqual({ v: 1, stack: [], palettes: [] })
  })

  it('gives every decoded node a distinct id', () => {
    const back = decodePresetParam('2~gr_by_gr_px')
    expect(new Set(back.stack.map((n) => n.id)).size).toBe(4)
  })
})

describe('preset URL length and URL-safety', () => {
  // A realistic share: colour grade, pixelate, bayer, and a custom palette.
  const realistic: Preset = {
    v: 1,
    stack: [
      { id: crypto.randomUUID(), type: 'grade', enabled: true, params: { brightness: 0.12, contrast: 1.35, gamma: 1, saturation: 0.8 } },
      { id: crypto.randomUUID(), type: 'pixelate', enabled: true, params: { pixelSize: 6, levels: 4, sampling: 'nearest', dither: false } },
      { id: crypto.randomUUID(), type: 'bayer', enabled: true, params: { matrix: '8', levels: 3 } },
      { id: crypto.randomUUID(), type: 'palette', enabled: true, params: { paletteId: 'c1' } },
    ],
    palettes: [{ id: 'c1', name: 'Custom 1', colors: [[0.07, 0.07, 0.12], [0.5, 0.2, 0.3], [0.9, 0.8, 0.6]] }],
  }

  it('encodes a realistic preset in under 80 characters', () => {
    // The same preset was 959 characters in the old base64-JSON format.
    expect(encodePresetParam(realistic).length).toBeLessThan(80)
  })

  it('uses only characters that need no percent-encoding in a URL', () => {
    expect(encodePresetParam(realistic)).toMatch(/^[A-Za-z0-9._~-]+$/)
  })

  it('survives a round-trip through a query string', () => {
    // URLSearchParams.get() percent-decodes, so a payload containing real `%`
    // escapes would be silently mangled before the decoder ever saw it.
    const param = encodePresetParam(realistic)
    const readBack = new URLSearchParams(`p=${param}`).get('p')
    expect(readBack).toBe(param)
  })

  it('survives a query-string round-trip even with a name full of delimiters', () => {
    const preset: Preset = {
      v: 1,
      stack: [{ id: 'n', type: 'palette', enabled: true, params: { paletteId: 'c1' } }],
      palettes: [{ id: 'c1', name: 'a-b_c~d%e f', colors: [[1, 1, 1]] }],
    }
    const param = encodePresetParam(preset)
    const readBack = new URLSearchParams(`p=${param}`).get('p')
    expect(readBack).toBe(param)
    expect(decodePresetParam(readBack!).palettes[0].name).toBe('a-b_c~d%e f')
  })
})

describe('preset URL backward compatibility', () => {
  it('still decodes a link shared in the old base64-JSON format', () => {
    const legacy = {
      v: 1,
      stack: [{ id: 'n1', type: 'bayer', enabled: true, params: { matrix: '8', levels: 3 } }],
      palettes: [],
    }
    const param = btoa(JSON.stringify(legacy))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodePresetParam(param)).toEqual(legacy)
  })

  it('only ever emits the new short format', () => {
    const param = encodePresetParam({
      v: 1,
      stack: [{ id: 'n1', type: 'bayer', enabled: true, params: { matrix: '8', levels: 3 } }],
      palettes: [],
    })
    expect(param.startsWith('2~')).toBe(true)
  })
})

describe('preset URL rejects malformed links', () => {
  it.each([
    ['an unknown effect code', '2~zz', /unknown effect code/],
    ['more params than the effect has', '2~by-8-3-9', /too many params/],
    ['palette colors that are not whole hex triplets', '2~du-0~Name-ff00', /malformed palette colors/],
    ['more sections than the format defines', '2~by~Name-ff0000~extra', /too many sections/],
    ['a palette record missing its colors', '2~du-0~Name', /malformed palette/],
    ['a stray delimiter inside an escaped name', '2~du-0~Na%me-ff0000', /stray character/],
    ['a truncated escape sequence', '2~du-0~Name.f-ff0000', /bad escape sequence/],
    ['an inherited Object.prototype key posing as a code', '2~constructor', /unknown effect code/],
    ['a __proto__ code', '2~.5f.5fproto.5f.5f', /unknown effect code/],
  ])('throws on %s', (_label, param, message) => {
    expect(() => decodePresetParam(param)).toThrow(message)
  })

  it('throws on garbage in the legacy format', () => {
    expect(() => decodePresetParam('!!!not-base64!!!')).toThrow()
  })
})
