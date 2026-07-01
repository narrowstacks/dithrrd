import { createStore } from 'zustand/vanilla'
import { useStore as useZustand } from 'zustand'
import type { StackNode } from '@/engine/planPasses'
import type { Palette, ParamValue } from '@/effects/types'
import { registry } from '@/effects/registry'
import { PALETTES } from '@/color/palettes'

export interface SourceImage {
  image: ImageData
  width: number
  height: number
}

export interface AppState {
  source: SourceImage | null
  stack: StackNode[]
  selectedId: string | null
  palettes: Record<string, Palette>
  setSource: (source: SourceImage) => void
  addNode: (type: string) => void
  removeNode: (id: string) => void
  toggleNode: (id: string) => void
  reorderNode: (from: number, to: number) => void
  duplicateNode: (id: string) => void
  updateParam: (id: string, key: string, value: ParamValue) => void
  selectNode: (id: string | null) => void
}

const newId = () => crypto.randomUUID()

export function createAppStore() {
  return createStore<AppState>((set) => ({
    source: null,
    stack: [],
    selectedId: null,
    palettes: PALETTES,

    setSource: (source) => set({ source }),

    addNode: (type) =>
      set((s) => {
        const def = registry[type]
        if (!def) return s
        const node: StackNode = {
          id: newId(),
          type,
          enabled: true,
          params: structuredClone(def.defaultParams),
        }
        return { stack: [...s.stack, node], selectedId: node.id }
      }),

    removeNode: (id) =>
      set((s) => ({
        stack: s.stack.filter((n) => n.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      })),

    toggleNode: (id) =>
      set((s) => ({
        stack: s.stack.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)),
      })),

    reorderNode: (from, to) =>
      set((s) => {
        const stack = [...s.stack]
        const [moved] = stack.splice(from, 1)
        stack.splice(to, 0, moved)
        return { stack }
      }),

    duplicateNode: (id) =>
      set((s) => {
        const i = s.stack.findIndex((n) => n.id === id)
        if (i < 0) return s
        const copy: StackNode = {
          ...s.stack[i],
          id: newId(),
          params: structuredClone(s.stack[i].params),
        }
        const stack = [...s.stack]
        stack.splice(i + 1, 0, copy)
        return { stack, selectedId: copy.id }
      }),

    updateParam: (id, key, value) =>
      set((s) => ({
        stack: s.stack.map((n) =>
          n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n,
        ),
      })),

    selectNode: (id) => set({ selectedId: id }),
  }))
}

export const appStore = createAppStore()
export const useStore = <T>(selector: (s: AppState) => T): T => useZustand(appStore, selector)
