import type { Effect } from '@/effects/types'
import { grade } from '@/effects/grade'
import { pixelate } from '@/effects/pixelate'
import { bayer } from '@/effects/bayer'
import { halftone } from '@/effects/halftone'
import { floyd } from '@/effects/floydSteinberg'

export const EFFECT_LIST: Effect[] = [grade, pixelate, bayer, halftone, floyd]

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
