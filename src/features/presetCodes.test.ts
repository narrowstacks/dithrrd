import { describe, it, expect } from 'vitest'
import { EFFECT_CODES } from '@/features/presetCodes'
import { EFFECT_LIST } from '@/effects/registry'
import { PALETTES } from '@/color/palettes'

describe('share-link effect codes', () => {
  it('gives every registered effect a code', () => {
    const missing = EFFECT_LIST.filter((e) => !EFFECT_CODES[e.type]).map((e) => e.type)
    expect(missing, 'add a NEW unused code to EFFECT_CODES for these').toEqual([])
  })

  it('never reuses a code for two effects', () => {
    const codes = Object.values(EFFECT_CODES)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('never starts a code with x, which marks a disabled node', () => {
    expect(Object.values(EFFECT_CODES).filter((c) => c.startsWith('x'))).toEqual([])
  })

  // The append-only lock. Adding an effect means adding a line here. Changing or
  // removing a line breaks every link already shared with that effect in it.
  it('holds every previously published code unchanged', () => {
    expect(EFFECT_CODES).toEqual({
      grade: 'gr',
      pixelate: 'px',
      bayer: 'by',
      halftone: 'ht',
      palette: 'pa',
      floyd: 'fs',
      atkinson: 'at',
      jarvis: 'ja',
      stucki: 'st',
      sierra: 'si',
      burkes: 'bu',
      clusteredDot: 'cd',
      lineScreen: 'ls',
      crosshatch: 'ch',
      duotone: 'du',
      perChannel: 'pc',
    })
  })
})

describe('share-link param order', () => {
  // Params ride the wire by POSITION, so the key order of each effect's
  // defaultParams is as load-bearing as the effect codes above. Appending a new
  // key is safe — older links simply stop short and keep the defaults. Inserting,
  // reordering or removing a key silently re-points every value in every link
  // already shared: `2~gr-0.12-1.35--0.8` would decode 0.12 into whatever key
  // now sits first. This test makes that a deliberate choice rather than a
  // side effect of editing an effect.
  it('holds every published param order unchanged, allowing only appends', () => {
    const order = Object.fromEntries(
      EFFECT_LIST.map((e) => [e.type, Object.keys(e.defaultParams)]),
    )
    expect(order).toEqual({
      grade: ['brightness', 'contrast', 'gamma', 'saturation'],
      pixelate: ['pixelSize', 'levels', 'sampling', 'dither'],
      bayer: ['matrix', 'levels'],
      halftone: ['cellSize', 'angle'],
      palette: ['paletteId'],
      floyd: ['levels', 'serpentine'],
      atkinson: ['levels', 'serpentine'],
      jarvis: ['levels', 'serpentine'],
      stucki: ['levels', 'serpentine'],
      sierra: ['levels', 'serpentine'],
      burkes: ['levels', 'serpentine'],
      clusteredDot: ['levels'],
      lineScreen: ['cellSize', 'angle'],
      crosshatch: ['cellSize', 'angle'],
      duotone: ['paletteId'],
      perChannel: ['levels', 'angle', 'scale'],
    })
  })
})

describe('built-in palette ids', () => {
  // A node's palette param holds either a built-in id or a bare decimal index
  // into the link's custom palettes. An all-digit built-in id would be
  // indistinguishable from an index.
  it('never uses an all-digit id, which would collide with a palette index', () => {
    const numeric = Object.keys(PALETTES).filter((id) => /^\d+$/.test(id))
    expect(numeric).toEqual([])
  })
})
