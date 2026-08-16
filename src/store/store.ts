import { createStore } from 'zustand/vanilla'
import { useStore as useZustand } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import type { StackNode } from '@/engine/planPasses'
import type { Palette, ParamValue } from '@/effects/types'
import type { Preset } from '@/features/preset'
import {
  loadPanelPrefs,
  savePanelPrefs,
  type PanelPrefs,
  loadViewportBgPrefs,
  saveViewportBgPrefs,
  type ViewportBgPrefs,
} from '@/features/uiPrefs'
import { registry } from '@/effects/registry'
import { PALETTES } from '@/color/palettes'
import { loadCustomPalettes, saveCustomPalettes } from '@/features/paletteStorage'

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
  eyedropper: { paletteId: string; index: number } | null
  panels: PanelPrefs
  viewportBg: ViewportBgPrefs
  addMenuOpen: boolean
  helpOpen: boolean
  setSource: (source: SourceImage) => void
  addNode: (type: string) => void
  removeNode: (id: string) => void
  toggleNode: (id: string) => void
  reorderNode: (from: number, to: number) => void
  duplicateNode: (id: string) => void
  updateParam: (id: string, key: string, value: ParamValue) => void
  selectNode: (id: string | null) => void
  togglePanel: (side: 'left' | 'right') => void
  setPanelCollapsed: (side: 'left' | 'right', collapsed: boolean) => void
  setViewportBg: (prefs: ViewportBgPrefs) => void
  setAddMenuOpen: (v: boolean) => void
  setHelpOpen: (v: boolean) => void
  addPalette: () => string
  updatePalette: (id: string, patch: { name?: string; colors?: [number, number, number][] }) => void
  removePalette: (id: string) => void
  duplicatePalette: (id: string) => string
  startEyedropper: (paletteId: string, index: number) => void
  cancelEyedropper: () => void
  applyEyedropper: (rgb: [number, number, number]) => void
  loadPreset: (preset: Preset) => void
}

type HistorySlice = Pick<AppState, 'stack' | 'palettes'>

const newId = () => crypto.randomUUID()

function loadInitialPalettes(): Record<string, Palette> {
  const custom = Object.fromEntries(loadCustomPalettes().map((p) => [p.id, p]))
  return { ...PALETTES, ...custom }
}

function nextCustomName(palettes: Record<string, Palette>): string {
  const used = new Set(Object.values(palettes).map((p) => p.name))
  for (let i = 1; ; i++) {
    const name = `Custom ${i}`
    if (!used.has(name)) return name
  }
}

export function createAppStore() {
  return createStore<AppState>()(
    temporal(
      (set, get) => ({
    source: null,
    stack: [],
    selectedId: null,
    palettes: loadInitialPalettes(),
    eyedropper: null,
    panels: loadPanelPrefs(),
    viewportBg: loadViewportBgPrefs(),
    addMenuOpen: false,
    helpOpen: false,

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

    togglePanel: (side) =>
      set((s) => ({ panels: { ...s.panels, [side]: !s.panels[side] } })),
    setPanelCollapsed: (side, collapsed) =>
      set((s) => ({ panels: { ...s.panels, [side]: collapsed } })),
    setViewportBg: (prefs) => set({ viewportBg: prefs }),
    setAddMenuOpen: (v) => set({ addMenuOpen: v }),
    setHelpOpen: (v) => set({ helpOpen: v }),

    addPalette: () => {
      const id = newId()
      set((s) => ({
        palettes: {
          ...s.palettes,
          [id]: { id, name: nextCustomName(s.palettes), colors: [[0, 0, 0], [1, 1, 1]] },
        },
      }))
      return id
    },

    updatePalette: (id, patch) =>
      set((s) => {
        if (id in PALETTES) return s
        const p = s.palettes[id]
        if (!p) return s
        return { palettes: { ...s.palettes, [id]: { ...p, ...patch } } }
      }),

    removePalette: (id) =>
      set((s) => {
        if (id in PALETTES || !(id in s.palettes)) return s
        const next = { ...s.palettes }
        delete next[id]
        return { palettes: next }
      }),

    duplicatePalette: (id) => {
      const src = get().palettes[id]
      if (!src) return ''
      const copyId = newId()
      set((s) => ({
        palettes: {
          ...s.palettes,
          [copyId]: {
            id: copyId,
            name: `${src.name} copy`,
            colors: src.colors.map((c) => [c[0], c[1], c[2]] as [number, number, number]),
          },
        },
      }))
      return copyId
    },

    startEyedropper: (paletteId, index) => set({ eyedropper: { paletteId, index } }),
    cancelEyedropper: () => set({ eyedropper: null }),
    applyEyedropper: (rgb) =>
      set((s) => {
        const t = s.eyedropper
        if (!t) return s
        const p = s.palettes[t.paletteId]
        if (!p) return { eyedropper: null }
        const colors = p.colors.map((c, j) => (j === t.index ? rgb : c))
        return { palettes: { ...s.palettes, [t.paletteId]: { ...p, colors } }, eyedropper: null }
      }),

    loadPreset: (preset) =>
      set((s) => {
        const palettes = { ...s.palettes }
        for (const p of preset.palettes) {
          if (!(p.id in PALETTES)) palettes[p.id] = p
        }
        const stack = preset.stack.map((n) => ({ ...n, params: { ...n.params } }))
        return { palettes, stack, selectedId: stack[0]?.id ?? null }
      }),
      }),
      {
        partialize: (s): HistorySlice => ({ stack: s.stack, palettes: s.palettes }),
        limit: 100,
        // Skip recording when neither stack nor palettes changed (e.g. selection,
        // eyedropper, panel toggles). References are always fresh on real edits.
        equality: (a, b) => a.stack === b.stack && a.palettes === b.palettes,
        // Coalesce a burst of rapid edits (slider drag, hex typing) into ONE undo
        // step: capture the state before the burst began, then commit once the
        // edits go idle for 400ms.
        handleSet: (handleSet) => {
          let timer: ReturnType<typeof setTimeout> | undefined
          let firstPrev: HistorySlice | undefined
          return (pastState) => {
            firstPrev ??= pastState as HistorySlice
            clearTimeout(timer)
            timer = setTimeout(() => {
              if (firstPrev) handleSet(firstPrev)
              firstPrev = undefined
              timer = undefined
            }, 400)
          }
        },
      },
    ),
  )
}

export const appStore = createAppStore()

// Persist the custom (non-built-in) palettes whenever the palette map changes.
// Subscription lives on the singleton only, so createAppStore() stays side-effect free for tests.
let lastPalettes = appStore.getState().palettes
appStore.subscribe((s) => {
  if (s.palettes === lastPalettes) return
  lastPalettes = s.palettes
  saveCustomPalettes(Object.values(s.palettes).filter((p) => !(p.id in PALETTES)))
})

let lastPanels = appStore.getState().panels
appStore.subscribe((s) => {
  if (s.panels === lastPanels) return
  lastPanels = s.panels
  savePanelPrefs(s.panels)
})

let lastViewportBg = appStore.getState().viewportBg
appStore.subscribe((s) => {
  if (s.viewportBg === lastViewportBg) return
  lastViewportBg = s.viewportBg
  saveViewportBgPrefs(s.viewportBg)
})

export const useStore = <T>(selector: (s: AppState) => T): T => useZustand(appStore, selector)
export const useTemporal = <T>(selector: (s: TemporalState<HistorySlice>) => T): T =>
  useZustand(appStore.temporal, selector)
