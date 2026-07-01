import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/store/store'

interface PaletteControlProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function PaletteControl({ label, value, onChange }: PaletteControlProps) {
  const palettes = useStore((s) => s.palettes)
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
    </div>
  )
}
