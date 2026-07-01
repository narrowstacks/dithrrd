import type { Palette } from '@/effects/types'
import { hexToRgb01 } from '@/color/hex'

const hex = hexToRgb01

export const PALETTES: Record<string, Palette> = {
  bw: { id: 'bw', name: 'Black & White', colors: [[0, 0, 0], [1, 1, 1]] },
  gray4: {
    id: 'gray4',
    name: 'Grayscale 4',
    colors: [[0, 0, 0], [0.333, 0.333, 0.333], [0.667, 0.667, 0.667], [1, 1, 1]],
  },
  gameboy: {
    id: 'gameboy',
    name: 'Game Boy',
    colors: [hex('0f380f'), hex('306230'), hex('8bac0f'), hex('9bbc0f')],
  },
}

export function nearestColor(
  rgb: [number, number, number],
  palette: Palette,
): [number, number, number] {
  let best = Infinity
  let pick = palette.colors[0]
  for (const c of palette.colors) {
    const dr = rgb[0] - c[0]
    const dg = rgb[1] - c[1]
    const db = rgb[2] - c[2]
    const d = dr * dr + dg * dg + db * db
    if (d < best) {
      best = d
      pick = c
    }
  }
  return [pick[0], pick[1], pick[2]]
}
