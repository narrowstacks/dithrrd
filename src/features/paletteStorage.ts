import type { Palette } from '@/effects/types'

export const PALETTE_STORAGE_KEY = 'dithrrd.palettes.v1'

function isPalette(x: unknown): x is Palette {
  if (typeof x !== 'object' || x === null) return false
  const p = x as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    Array.isArray(p.colors) &&
    p.colors.every(
      (c) => Array.isArray(c) && c.length === 3 && c.every((n) => typeof n === 'number'),
    )
  )
}

export function loadCustomPalettes(): Palette[] {
  try {
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPalette)
  } catch {
    return []
  }
}

export function saveCustomPalettes(palettes: Palette[]): void {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palettes))
  } catch {
    // storage unavailable or over quota — non-fatal, custom palettes just won't persist
  }
}
