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

describe('built-in palette ids', () => {
  // A node's palette param holds either a built-in id or a bare decimal index
  // into the link's custom palettes. An all-digit built-in id would be
  // indistinguishable from an index.
  it('never uses an all-digit id, which would collide with a palette index', () => {
    const numeric = Object.keys(PALETTES).filter((id) => /^\d+$/.test(id))
    expect(numeric).toEqual([])
  })
})
