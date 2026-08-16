import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAppStore } from '@/store/store'

describe('undo/redo history', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces a burst of edits to the same param into one undo step', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    vi.advanceTimersByTime(400)
    const id = s.getState().stack[0].id
    s.getState().updateParam(id, 'levels', 3)
    s.getState().updateParam(id, 'levels', 4)
    s.getState().updateParam(id, 'levels', 5)
    vi.advanceTimersByTime(400)
    expect(s.getState().stack[0].params.levels).toBe(5)
    s.temporal.getState().undo()
    // one undo returns to the value before the whole burst (default 2), not 4
    expect(s.getState().stack[0].params.levels).toBe(2)
  })

  it('partialize records only stack + palettes', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    vi.advanceTimersByTime(400)
    const past = s.temporal.getState().pastStates.at(-1)!
    expect(past).toHaveProperty('stack')
    expect(past).toHaveProperty('palettes')
    expect(past).not.toHaveProperty('selectedId')
    expect(past).not.toHaveProperty('source')
  })

  it('does not record selection-only changes', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    vi.advanceTimersByTime(400)
    const before = s.temporal.getState().pastStates.length
    s.getState().selectNode(null)
    vi.advanceTimersByTime(400)
    expect(s.temporal.getState().pastStates.length).toBe(before)
  })

  it('caps history at the configured limit', () => {
    const s = createAppStore()
    for (let i = 0; i < 130; i++) {
      s.getState().addNode('bayer')
      vi.advanceTimersByTime(400)
    }
    expect(s.temporal.getState().pastStates.length).toBeLessThanOrEqual(100)
  })

  it('redo re-applies an undone change', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    vi.advanceTimersByTime(400)
    expect(s.getState().stack).toHaveLength(1)
    s.temporal.getState().undo()
    expect(s.getState().stack).toHaveLength(0)
    s.temporal.getState().redo()
    expect(s.getState().stack).toHaveLength(1)
  })
})
