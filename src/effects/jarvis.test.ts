import { describe, it, expect } from 'vitest'
import { jarvis } from '@/effects/jarvis'

describe('jarvis effect', () => {
  it('is a diffusion CPU effect', () => {
    expect(jarvis.kind).toBe('cpu')
    expect(jarvis.family).toBe('diffusion')
    expect(jarvis.type).toBe('jarvis')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(jarvis.controls.map((c) => c.key))
    for (const k of Object.keys(jarvis.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
