import type { Effect } from '@/effects/types'
import { grade } from '@/effects/grade'
import { floyd } from '@/effects/floydSteinberg'

export const EFFECT_LIST: Effect[] = [grade, floyd]

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
