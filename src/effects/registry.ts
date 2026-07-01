import type { Effect } from '@/effects/types'

// Effect modules are appended here as they are implemented (Tasks 4, 6-10).
export const EFFECT_LIST: Effect[] = []

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
