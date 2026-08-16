import type { CSSProperties } from 'react'
import type { ViewportBgPrefs } from '@/features/uiPrefs'

// Flat-color presets. Deliberately NOT tied to the light/dark UI theme tokens
// (--background etc.) — Photoshop-style canvas backdrops are independent of
// app chrome, so a dark UI can still show a white backdrop and vice versa.
const PRESET_COLORS: Record<Exclude<ViewportBgPrefs['preset'], 'checkerboard' | 'custom'>, string> = {
  white: '#ffffff',
  lightGray: '#c7c7c7',
  mediumGray: '#808080',
  darkGray: '#3a3a3a',
  black: '#000000',
}

// Fixed neutral checker pair (not derived from theme tokens) so the
// checkerboard reads the same regardless of light/dark UI mode.
const CHECKER_LIGHT = '#ffffff'
const CHECKER_DARK = '#cccccc'

/** Maps a viewport-background preference to an inline style for the viewport container. */
export function viewportBgStyle(prefs: ViewportBgPrefs): CSSProperties {
  if (prefs.preset === 'checkerboard') {
    return {
      backgroundColor: CHECKER_DARK,
      backgroundImage: `repeating-conic-gradient(${CHECKER_LIGHT} 0% 25%, transparent 0% 50%)`,
      backgroundSize: '20px 20px',
    }
  }
  const color = prefs.preset === 'custom' ? prefs.customColor : PRESET_COLORS[prefs.preset]
  return { backgroundColor: color, backgroundImage: 'none' }
}
