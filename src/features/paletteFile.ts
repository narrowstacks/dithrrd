import type { Palette } from '@/effects/types'

type RGB = [number, number, number]

export function paletteToJson(palette: Palette): string {
  return JSON.stringify({ name: palette.name, colors: palette.colors }, null, 2)
}

export function parsePaletteJson(text: string): { name: string; colors: RGB[] } {
  const parsed = JSON.parse(text) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid palette file')
  const o = parsed as Record<string, unknown>
  if (typeof o.name !== 'string') throw new Error('palette file missing name')
  if (
    !Array.isArray(o.colors) ||
    !o.colors.every(
      (c) => Array.isArray(c) && c.length === 3 && c.every((n) => typeof n === 'number'),
    )
  ) {
    throw new Error('palette file has invalid colors')
  }
  return { name: o.name, colors: (o.colors as RGB[]).slice(0, 16) }
}

export function downloadPalette(palette: Palette): void {
  const blob = new Blob([paletteToJson(palette)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${palette.name.replace(/[^\w-]+/g, '_') || 'palette'}.dithrrd-palette.json`
  a.click()
  URL.revokeObjectURL(url)
}
