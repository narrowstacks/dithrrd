import { describe, it, expect } from 'vitest'
import { sierra } from '@/effects/sierra'

describe('sierra effect', () => {
  it('is a diffusion CPU effect', () => {
    expect(sierra.kind).toBe('cpu')
    expect(sierra.family).toBe('diffusion')
    expect(sierra.type).toBe('sierra')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(sierra.controls.map((c) => c.key))
    for (const k of Object.keys(sierra.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
