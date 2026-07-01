import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadNamedPresets, saveNamedPresets, addNamedPreset, deleteNamedPreset, PRESET_STORAGE_KEY,
} from '@/features/presetStorage'
import type { Preset } from '@/features/preset'

const preset: Preset = { v: 1, stack: [], palettes: [] }

describe('presetStorage', () => {
  beforeEach(() => localStorage.clear())

  it('returns [] when empty', () => {
    expect(loadNamedPresets()).toEqual([])
  })
  it('adds and lists a named preset', () => {
    const np = addNamedPreset('Look A', preset)
    expect(np.name).toBe('Look A')
    expect(np.id).toBeTruthy()
    expect(loadNamedPresets()).toEqual([np])
  })
  it('deletes by id', () => {
    const np = addNamedPreset('Look A', preset)
    deleteNamedPreset(np.id)
    expect(loadNamedPresets()).toEqual([])
  })
  it('returns [] on malformed JSON and drops invalid entries', () => {
    localStorage.setItem(PRESET_STORAGE_KEY, '{bad')
    expect(loadNamedPresets()).toEqual([])
    saveNamedPresets([{ id: 'x' } as unknown as never])
    expect(loadNamedPresets()).toEqual([])
  })
})
