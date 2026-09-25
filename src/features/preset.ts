import type { StackNode } from '@/engine/planPasses'
import type { Palette } from '@/effects/types'
import { PALETTES } from '@/color/palettes'

export interface Preset {
  v: number
  stack: StackNode[]
  palettes: Palette[]
}

export const PRESET_VERSION = 1

export function buildPreset(stack: StackNode[], palettes: Record<string, Palette>): Preset {
  const referenced = new Set<string>()
  for (const node of stack) {
    const id = node.params.paletteId
    if (typeof id === 'string' && !(id in PALETTES) && palettes[id]) referenced.add(id)
  }
  return {
    v: PRESET_VERSION,
    stack: stack.map((n) => ({ ...n, params: { ...n.params } })),
    palettes: [...referenced].map((id) => {
      const p = palettes[id]
      return { id: p.id, name: p.name, colors: p.colors.map((c) => [c[0], c[1], c[2]] as [number, number, number]) }
    }),
  }
}

export function presetToJson(preset: Preset): string {
  return JSON.stringify(preset, null, 2)
}

function isStackNode(x: unknown): x is StackNode {
  if (typeof x !== 'object' || x === null) return false
  const n = x as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    typeof n.type === 'string' &&
    typeof n.enabled === 'boolean' &&
    typeof n.params === 'object' && n.params !== null
  )
}

function isPalette(x: unknown): x is Palette {
  if (typeof x !== 'object' || x === null) return false
  const p = x as Record<string, unknown>
  if (typeof p.id === 'string' && (p.id === '__proto__' || p.id === 'constructor' || p.id === 'prototype')) return false
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    Array.isArray(p.colors) &&
    p.colors.every((c) => Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === 'number'))
  )
}

export function parsePresetJson(text: string): Preset {
  const parsed = JSON.parse(text) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid preset')
  const o = parsed as Record<string, unknown>
  if (typeof o.v !== 'number') throw new Error('preset missing version')
  if (!Array.isArray(o.stack) || !o.stack.every(isStackNode)) throw new Error('preset has invalid stack')
  if (!Array.isArray(o.palettes) || !o.palettes.every(isPalette)) throw new Error('preset has invalid palettes')
  return { v: o.v, stack: o.stack as StackNode[], palettes: o.palettes as Palette[] }
}
