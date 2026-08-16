import { isValidHex } from '@/color/hex'

export const PANEL_PREFS_KEY = 'dithrrd.panels.v1'

export interface PanelPrefs {
  left: boolean
  right: boolean
}

const DEFAULT: PanelPrefs = { left: false, right: false }

export function loadPanelPrefs(): PanelPrefs {
  try {
    const raw = localStorage.getItem(PANEL_PREFS_KEY)
    if (!raw) return { ...DEFAULT }
    const p = JSON.parse(raw)
    if (typeof p?.left === 'boolean' && typeof p?.right === 'boolean') {
      return { left: p.left, right: p.right }
    }
    return { ...DEFAULT }
  } catch {
    return { ...DEFAULT }
  }
}

export function savePanelPrefs(prefs: PanelPrefs): void {
  try {
    localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable — non-fatal, prefs just won't persist
  }
}

// Viewport (canvas backdrop) background — independent of the light/dark UI
// theme. Photoshop-style: a checkerboard by default, or a flat preset/custom
// color behind the (possibly transparent) dithered image.
export const VIEWPORT_BG_KEY = 'dithrrd.viewportBg.v1'

export const VIEWPORT_BG_PRESETS = [
  'checkerboard',
  'white',
  'lightGray',
  'mediumGray',
  'darkGray',
  'black',
  'custom',
] as const

export type ViewportBgPreset = (typeof VIEWPORT_BG_PRESETS)[number]

export interface ViewportBgPrefs {
  preset: ViewportBgPreset
  customColor: string
}

const VIEWPORT_BG_PRESET_SET = new Set<string>(VIEWPORT_BG_PRESETS)
const VIEWPORT_BG_DEFAULT: ViewportBgPrefs = { preset: 'checkerboard', customColor: '#808080' }

export function loadViewportBgPrefs(): ViewportBgPrefs {
  try {
    const raw = localStorage.getItem(VIEWPORT_BG_KEY)
    if (!raw) return { ...VIEWPORT_BG_DEFAULT }
    const p = JSON.parse(raw)
    if (
      typeof p?.preset === 'string' &&
      VIEWPORT_BG_PRESET_SET.has(p.preset) &&
      typeof p?.customColor === 'string' &&
      isValidHex(p.customColor)
    ) {
      return { preset: p.preset, customColor: p.customColor }
    }
    return { ...VIEWPORT_BG_DEFAULT }
  } catch {
    return { ...VIEWPORT_BG_DEFAULT }
  }
}

export function saveViewportBgPrefs(prefs: ViewportBgPrefs): void {
  try {
    localStorage.setItem(VIEWPORT_BG_KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable — non-fatal, prefs just won't persist
  }
}
