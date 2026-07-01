import type { Effect } from '@/effects/types'
import { grade } from '@/effects/grade'
import { pixelate } from '@/effects/pixelate'
import { bayer } from '@/effects/bayer'
import { halftone } from '@/effects/halftone'
import { paletteEffect } from '@/effects/palette'
import { floyd } from '@/effects/floydSteinberg'
import { atkinson } from '@/effects/atkinson'
import { jarvis } from '@/effects/jarvis'
import { stucki } from '@/effects/stucki'
import { sierra } from '@/effects/sierra'
import { burkes } from '@/effects/burkes'
import { clusteredDot } from '@/effects/clusteredDot'
import { lineScreen } from '@/effects/lineScreen'

export const EFFECT_LIST: Effect[] = [grade, pixelate, bayer, halftone, paletteEffect, floyd, atkinson, jarvis, stucki, sierra, burkes, clusteredDot, lineScreen]

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
