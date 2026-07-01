import { describe, it, expect } from 'vitest'
import { atkinson } from '@/effects/atkinson'

describe('atkinson effect', () => {
  it('is a diffusion CPU effect with a matching worker kernel type', () => {
    expect(atkinson.kind).toBe('cpu')
    expect(atkinson.family).toBe('diffusion')
    expect(atkinson.type).toBe('atkinson')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(atkinson.controls.map((c) => c.key))
    for (const k of Object.keys(atkinson.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
