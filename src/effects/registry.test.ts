import { describe, it, expect } from 'vitest'
import { EFFECT_LIST, registry } from '@/effects/registry'
import { EFFECT_ICONS } from '@/ui/effectIcons'
import { KERNELS } from '@/worker/algorithms'

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

  // Every effect needs its own icon, and a rename must not leave a stale entry behind:
  // effectIcon() silently falls back to a placeholder, so only a test catches drift.
  it('icon map keys exactly match the registered effect types', () => {
    expect(Object.keys(EFFECT_ICONS).sort()).toEqual(EFFECT_LIST.map((e) => e.type).sort())
  })

  it('assigns a distinct icon to every effect', () => {
    const icons = Object.values(EFFECT_ICONS)
    expect(new Set(icons).size).toBe(icons.length)
  })

  // Locks the worker-dispatch <-> effect-registration coupling: every kernel-driven
  // diffusion effect must have a matching KERNELS entry, and vice versa. 'floyd' is
  // excluded because it uses a bespoke worker handler, not a KERNELS entry.
  it('KERNELS keys exactly match the kernel-driven diffusion effect types', () => {
    const diffusionTypes = EFFECT_LIST.filter(
      (e) => e.family === 'diffusion' && e.type !== 'floyd',
    )
      .map((e) => e.type)
      .sort()
    expect(Object.keys(KERNELS).sort()).toEqual(diffusionTypes)
  })
})
