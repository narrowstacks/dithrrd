import { useState, useEffect } from 'react'
import { X, ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/store'
import { PALETTES } from '@/color/palettes'
import { hexToRgb01, rgb01ToHex, isValidHex } from '@/color/hex'

type RGB = [number, number, number]

const MAX_SWATCHES = 16

export function PaletteEditor({ paletteId }: { paletteId: string }) {
  const palette = useStore((s) => s.palettes[paletteId])
  const updatePalette = useStore((s) => s.updatePalette)
  if (!palette) return null

  const isBuiltin = paletteId in PALETTES
  if (isBuiltin) {
    return (
      <p className="text-xs text-muted-foreground">
        Built-in palette. Duplicate it to edit its colors.
      </p>
    )
  }

  const setColors = (colors: RGB[]) => updatePalette(paletteId, { colors })

  const addSwatch = () => {
    if (palette.colors.length >= MAX_SWATCHES) return
    setColors([...palette.colors, [0, 0, 0]])
  }
  const removeSwatch = (i: number) => {
    if (palette.colors.length <= 1) return
    setColors(palette.colors.filter((_, j) => j !== i))
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= palette.colors.length) return
    const next = palette.colors.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setColors(next)
  }

  return (
    <div className="space-y-1.5">
      <ul className="flex flex-col gap-1.5">
        {palette.colors.map((c, i) => (
          <SwatchRow
            key={i}
            index={i}
            color={c}
            count={palette.colors.length}
            onColor={(rgb) => setColors(palette.colors.map((x, j) => (j === i ? rgb : x)))}
            onRemove={() => removeSwatch(i)}
            onMove={(dir) => move(i, dir)}
          />
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addSwatch}
        disabled={palette.colors.length >= MAX_SWATCHES}
      >
        <Plus className="mr-1 size-3" /> Add swatch
      </Button>
    </div>
  )
}

interface SwatchRowProps {
  index: number
  color: RGB
  count: number
  onColor: (rgb: RGB) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}

function SwatchRow({ index, color, count, onColor, onRemove, onMove }: SwatchRowProps) {
  const hex = rgb01ToHex(color)
  // Local text state so an in-progress invalid hex (mid-typing) doesn't clobber the field.
  const [text, setText] = useState(hex)
  // Re-sync when the stored color changes from elsewhere (reorder, eyedropper, duplicate).
  useEffect(() => {
    setText(hex)
  }, [hex])

  return (
    <li className="flex items-center gap-1.5">
      <span
        className="size-6 shrink-0 rounded border"
        style={{ backgroundColor: hex }}
        aria-hidden
      />
      <Input
        aria-label={`Swatch ${index + 1} hex`}
        className="h-7 flex-1 font-mono text-xs"
        value={text}
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          if (isValidHex(v)) onColor(hexToRgb01(v))
        }}
      />
      <button
        type="button"
        aria-label="Move swatch left"
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowLeft className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Move swatch right"
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowRight className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Remove swatch"
        className="text-muted-foreground hover:text-destructive disabled:opacity-30"
        disabled={count <= 1}
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </li>
  )
}
