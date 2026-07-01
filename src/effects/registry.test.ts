import { describe, it, expect } from 'vitest'
import { EFFECT_LIST, registry } from '@/effects/registry'

describe('registry integrity', () => {
  it('has a unique type per effect', () => {
    const types = EFFECT_LIST.map((e) => e.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('every effect default param has a matching control key', () => {
    for (const e of EFFECT_LIST) {
      const controlKeys = new Set(e.controls.map((c) => c.key))
      for (const key of Object.keys(e.defaultParams)) {
        expect(controlKeys.has(key), `${e.type}.${key}`).toBe(true)
      }
    }
  })

  it('registry maps type -> effect', () => {
    for (const e of EFFECT_LIST) expect(registry[e.type]).toBe(e)
  })
})
