import type { Effect } from '@/effects/types'
import { floyd } from '@/effects/floydSteinberg'

export const EFFECT_LIST: Effect[] = [floyd]

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
