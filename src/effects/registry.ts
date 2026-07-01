import type { Effect } from '@/effects/types'
import { grade } from '@/effects/grade'
import { pixelate } from '@/effects/pixelate'
import { bayer } from '@/effects/bayer'
import { halftone } from '@/effects/halftone'
import { paletteEffect } from '@/effects/palette'
import { floyd } from '@/effects/floydSteinberg'
import { atkinson } from '@/effects/atkinson'

export const EFFECT_LIST: Effect[] = [grade, pixelate, bayer, halftone, paletteEffect, floyd, atkinson]

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
