import { describe, it, expect } from 'vitest'
import { stucki } from '@/effects/stucki'

describe('stucki effect', () => {
  it('is a diffusion CPU effect', () => {
    expect(stucki.kind).toBe('cpu')
    expect(stucki.family).toBe('diffusion')
    expect(stucki.type).toBe('stucki')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(stucki.controls.map((c) => c.key))
    for (const k of Object.keys(stucki.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
