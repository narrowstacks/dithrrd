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
