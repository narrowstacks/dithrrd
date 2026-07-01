import { describe, it, expect } from 'vitest'
import { planPasses } from '@/engine/planPasses'
import type { Effect } from '@/effects/types'

const fakeReg: Record<string, Effect> = {
  a: { kind: 'gpu', type: 'a', name: 'A', family: 'ordered', defaultParams: {}, controls: [], frag: '', uniformKeys: [], uniforms: () => ({}) },
  b: { kind: 'gpu', type: 'b', name: 'B', family: 'ordered', defaultParams: {}, controls: [], frag: '', uniformKeys: [], uniforms: () => ({}) },
}

describe('planPasses', () => {
  it('keeps enabled nodes in order and resolves effects', () => {
    const steps = planPasses(
      [
        { id: '1', type: 'a', enabled: true, params: {} },
        { id: '2', type: 'b', enabled: true, params: {} },
      ],
      fakeReg,
    )
    expect(steps.map((s) => s.node.id)).toEqual(['1', '2'])
    expect(steps[0].effect).toBe(fakeReg.a)
  })

  it('drops disabled nodes', () => {
    const steps = planPasses([{ id: '1', type: 'a', enabled: false, params: {} }], fakeReg)
    expect(steps).toHaveLength(0)
  })

  it('drops nodes whose type is not in the registry', () => {
    const steps = planPasses([{ id: '1', type: 'zzz', enabled: true, params: {} }], fakeReg)
    expect(steps).toHaveLength(0)
  })
})
