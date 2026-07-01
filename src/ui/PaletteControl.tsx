import { Plus, Copy, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/store/store'
import { PALETTES } from '@/color/palettes'
import { PaletteEditor } from '@/ui/PaletteEditor'

interface PaletteControlProps {
  label: string
  value: string
  onChange: (value: string) => void
}

const FALLBACK_ID = 'bw'

export function PaletteControl({ label, value, onChange }: PaletteControlProps) {
  const palettes = useStore((s) => s.palettes)
  const addPalette = useStore((s) => s.addPalette)
  const duplicatePalette = useStore((s) => s.duplicatePalette)
  const removePalette = useStore((s) => s.removePalette)
  const updatePalette = useStore((s) => s.updatePalette)

  const current = palettes[value]
  const isBuiltin = value in PALETTES

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as string)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.values(palettes).map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => onChange(addPalette())}>
          <Plus className="mr-1 size-3" /> New palette
        </Button>
        <Button variant="outline" size="sm" onClick={() => onChange(duplicatePalette(value))}>
          <Copy className="mr-1 size-3" /> Duplicate
        </Button>
      </div>

      {current && !isBuiltin && (
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Palette name"
            className="h-7 flex-1 text-xs"
            value={current.name}
            onChange={(e) => updatePalette(value, { name: e.target.value })}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete palette"
            onClick={() => {
              removePalette(value)
              onChange(FALLBACK_ID)
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}

      <PaletteEditor paletteId={value} />
    </div>
  )
}
