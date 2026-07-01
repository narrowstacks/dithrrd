import type { Palette } from '@/effects/types'

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(0, 2), 16) / 255,
  parseInt(h.slice(2, 4), 16) / 255,
  parseInt(h.slice(4, 6), 16) / 255,
]

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
