import { describe, it, expect } from 'vitest'
import { createAppStore } from '@/store/store'

describe('app store', () => {
  it('adds a node with default params and selects it', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const { stack, selectedId } = s.getState()
    expect(stack).toHaveLength(1)
    expect(stack[0].type).toBe('bayer')
    expect(stack[0].enabled).toBe(true)
    expect(stack[0].params).toMatchObject({ matrix: '4', levels: 2 })
    expect(selectedId).toBe(stack[0].id)
  })

  it('updates a single param immutably', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const id = s.getState().stack[0].id
    s.getState().updateParam(id, 'levels', 4)
    expect(s.getState().stack[0].params.levels).toBe(4)
  })

  it('toggles enabled', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const id = s.getState().stack[0].id
    s.getState().toggleNode(id)
    expect(s.getState().stack[0].enabled).toBe(false)
  })

  it('reorders nodes', () => {
    const s = createAppStore()
    s.getState().addNode('grade')
    s.getState().addNode('bayer')
    const [a, b] = s.getState().stack.map((n) => n.id)
    s.getState().reorderNode(0, 1)
    expect(s.getState().stack.map((n) => n.id)).toEqual([b, a])
  })

  it('duplicates a node right after the original with fresh id', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const id = s.getState().stack[0].id
    s.getState().duplicateNode(id)
    const stack = s.getState().stack
    expect(stack).toHaveLength(2)
    expect(stack[1].id).not.toBe(id)
    expect(stack[1].params).toEqual(stack[0].params)
    expect(stack[1].params).not.toBe(stack[0].params) // deep copy
  })

  it('removes a node and clears selection if it was selected', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const id = s.getState().stack[0].id
    s.getState().removeNode(id)
    expect(s.getState().stack).toHaveLength(0)
    expect(s.getState().selectedId).toBeNull()
  })
})
