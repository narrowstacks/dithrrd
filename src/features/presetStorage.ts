import type { Preset } from '@/features/preset'

export const PRESET_STORAGE_KEY = 'dithrrd.presets.v1'

export interface NamedPreset {
  id: string
  name: string
  preset: Preset
}

function isNamedPreset(x: unknown): x is NamedPreset {
  if (typeof x !== 'object' || x === null) return false
  const n = x as Record<string, unknown>
  if (typeof n.id !== 'string' || typeof n.name !== 'string') return false
  const p = n.preset as Record<string, unknown> | undefined
  return (
    typeof p === 'object' && p !== null &&
    typeof p.v === 'number' && Array.isArray(p.stack) && Array.isArray(p.palettes)
  )
}

export function loadNamedPresets(): NamedPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isNamedPreset)
  } catch {
    return []
  }
}

export function saveNamedPresets(list: NamedPreset[]): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // storage unavailable / over quota — non-fatal
  }
}

export function addNamedPreset(name: string, preset: Preset): NamedPreset {
  const np: NamedPreset = { id: crypto.randomUUID(), name, preset }
  saveNamedPresets([...loadNamedPresets(), np])
  return np
}

export function deleteNamedPreset(id: string): void {
  saveNamedPresets(loadNamedPresets().filter((p) => p.id !== id))
}
