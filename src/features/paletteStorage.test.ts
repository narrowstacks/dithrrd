import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadCustomPalettes,
  saveCustomPalettes,
  PALETTE_STORAGE_KEY,
} from '@/features/paletteStorage'
import type { Palette } from '@/effects/types'

const sample: Palette = { id: 'p1', name: 'Mine', colors: [[0, 0, 0], [1, 1, 1]] }

describe('paletteStorage', () => {
  beforeEach(() => localStorage.clear())

  it('returns [] when nothing is stored', () => {
    expect(loadCustomPalettes()).toEqual([])
  })

  it('round-trips a saved palette', () => {
    saveCustomPalettes([sample])
    expect(loadCustomPalettes()).toEqual([sample])
  })

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, '{not json')
    expect(loadCustomPalettes()).toEqual([])
  })

  it('drops entries with an invalid shape', () => {
    localStorage.setItem(
      PALETTE_STORAGE_KEY,
      JSON.stringify([
        sample,
        { id: 'bad' }, // missing name/colors
        { id: 'x', name: 'y', colors: 'nope' }, // colors not an array
      ]),
    )
    expect(loadCustomPalettes()).toEqual([sample])
  })
})
