import {
  AlignJustify,
  Blend,
  CircleDot,
  Contrast,
  Grid2x2,
  Grid3x3,
  Grip,
  Hash,
  Network,
  Palette,
  Radar,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Square,
  Waves,
  Wind,
  type LucideIcon,
} from 'lucide-react'

// Icons live in the UI layer rather than on the effect definitions so the worker and
// engine bundles stay free of React components. registry.test.ts locks this map to
// EFFECT_LIST so a new effect can't ship without one.
const EFFECT_ICONS: Record<string, LucideIcon> = {
  // Color
  grade: SlidersHorizontal,
  palette: Palette,
  duotone: Contrast,

  // Pixelate
  pixelate: Grid2x2,

  // Ordered — threshold matrices
  bayer: Grid3x3,
  clusteredDot: CircleDot,
  perChannel: Blend,

  // Halftone — screens
  halftone: Grip,
  lineScreen: AlignJustify,
  crosshatch: Hash,

  // Error diffusion — one silhouette per kernel, since the names alone are hard to
  // tell apart at a glance.
  floyd: Waves,
  atkinson: Sparkles,
  jarvis: Network,
  stucki: Radar,
  sierra: Snowflake,
  burkes: Wind,
}

export function effectIcon(type: string): LucideIcon {
  return EFFECT_ICONS[type] ?? Square
}

export { EFFECT_ICONS }
