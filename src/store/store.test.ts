import { describe, it, expect, beforeEach } from 'vitest'
import { createAppStore } from '@/store/store'
import { PALETTES } from '@/color/palettes'
import { loadCustomPalettes } from '@/features/paletteStorage'

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

describe('app store — palettes', () => {
  beforeEach(() => localStorage.clear())

  it('starts with the built-in palettes', () => {
    const s = createAppStore()
    expect(Object.keys(s.getState().palettes).sort()).toEqual(Object.keys(PALETTES).sort())
  })

  it('addPalette creates a custom palette with a black+white default and returns its id', () => {
    const s = createAppStore()
    const id = s.getState().addPalette()
    const p = s.getState().palettes[id]
    expect(p).toBeTruthy()
    expect(p.colors).toEqual([[0, 0, 0], [1, 1, 1]])
    expect(id in PALETTES).toBe(false)
  })

  it('updatePalette merges name and colors', () => {
    const s = createAppStore()
    const id = s.getState().addPalette()
    s.getState().updatePalette(id, { name: 'Sunset', colors: [[1, 0, 0]] })
    expect(s.getState().palettes[id]).toMatchObject({ name: 'Sunset', colors: [[1, 0, 0]] })
  })

  it('removePalette deletes a custom palette but ignores built-ins', () => {
    const s = createAppStore()
    const id = s.getState().addPalette()
    s.getState().removePalette(id)
    expect(s.getState().palettes[id]).toBeUndefined()
    s.getState().removePalette('bw')
    expect(s.getState().palettes.bw).toBeTruthy() // built-in survives
  })

  it('duplicatePalette copies (built-in or custom) into a new custom palette', () => {
    const s = createAppStore()
    const id = s.getState().duplicatePalette('gameboy')
    expect(id).not.toBe('gameboy')
    expect(id in PALETTES).toBe(false)
    expect(s.getState().palettes[id].colors).toEqual(PALETTES.gameboy.colors)
    expect(s.getState().palettes[id].colors).not.toBe(PALETTES.gameboy.colors) // deep copy
    expect(s.getState().palettes[id].name).toMatch(/copy/i)
  })
})

describe('app store — palette persistence (singleton)', () => {
  beforeEach(() => localStorage.clear())

  it('persists custom palettes (not built-ins) via the exported appStore', async () => {
    const { appStore } = await import('@/store/store')
    const id = appStore.getState().addPalette()
    const persisted = loadCustomPalettes()
    expect(persisted.map((p) => p.id)).toContain(id)
    expect(persisted.some((p) => p.id in PALETTES)).toBe(false)
    appStore.getState().removePalette(id) // cleanup shared singleton state
  })
})
