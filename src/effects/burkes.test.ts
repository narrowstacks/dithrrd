import { describe, it, expect } from 'vitest'
import { burkes } from '@/effects/burkes'

describe('burkes effect', () => {
  it('is a diffusion CPU effect', () => {
    expect(burkes.kind).toBe('cpu')
    expect(burkes.family).toBe('diffusion')
    expect(burkes.type).toBe('burkes')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(burkes.controls.map((c) => c.key))
    for (const k of Object.keys(burkes.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
