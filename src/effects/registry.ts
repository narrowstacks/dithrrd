import type { Effect } from '@/effects/types'
import { grade } from '@/effects/grade'
import { bayer } from '@/effects/bayer'
import { floyd } from '@/effects/floydSteinberg'

export const EFFECT_LIST: Effect[] = [grade, bayer, floyd]

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
