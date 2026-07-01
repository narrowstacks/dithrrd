export type Family = 'color' | 'ordered' | 'diffusion' | 'halftone' | 'pixelate'

export interface SliderControl { type: 'slider'; key: string; label: string; min: number; max: number; step: number }
export interface SelectControl { type: 'select'; key: string; label: string; options: { label: string; value: string }[] }
export interface ToggleControl { type: 'toggle'; key: string; label: string }
export interface PaletteControl { type: 'palette'; key: string; label: string }
export interface AngleControl { type: 'angle'; key: string; label: string }
export type Control = SliderControl | SelectControl | ToggleControl | PaletteControl | AngleControl

export type ParamValue = number | string | boolean
export type Params = Record<string, ParamValue>

export interface Palette {
  id: string
  name: string
  colors: [number, number, number][] // 0..1
}

export interface EffectContext {
  palettes: Record<string, Palette>
}

interface BaseEffect {
  type: string
  name: string
  family: Family
  defaultParams: Params
  controls: Control[]
}

export interface GpuEffect extends BaseEffect {
  kind: 'gpu'
  frag: string
  /** Names of the effect-specific uniforms (src + resolution are always provided by the backend). */
  uniformKeys: string[]
  /** Pure map from params -> uniform values. Keys MUST match uniformKeys. */
  uniforms(params: Params, ctx: EffectContext): Record<string, unknown>
}

export interface CpuEffect extends BaseEffect {
  kind: 'cpu'
  /** Mutates the RGBA buffer in place. Must be a pure function of its inputs. */
  process(buf: Uint8ClampedArray, width: number, height: number, params: Params): void
}

export type Effect = GpuEffect | CpuEffect
