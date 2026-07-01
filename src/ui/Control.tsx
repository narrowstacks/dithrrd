import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Control as ControlSchema, ParamValue } from '@/effects/types'
import { PALETTES } from '@/color/palettes'

interface ControlProps {
  control: ControlSchema
  value: ParamValue
  onChange: (value: ParamValue) => void
}

export function Control({ control, value, onChange }: ControlProps) {
  switch (control.type) {
    case 'slider':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{control.label}</Label>
            <span className="tabular-nums text-xs text-muted-foreground">{Number(value)}</span>
          </div>
          <Slider
            min={control.min}
            max={control.max}
            step={control.step}
            value={Number(value)}
            onValueChange={(v) => onChange(v as number)}
          />
        </div>
      )
    case 'angle':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{control.label}</Label>
            <span className="tabular-nums text-xs text-muted-foreground">{Number(value)}°</span>
          </div>
          <Slider
            min={0}
            max={360}
            step={1}
            value={Number(value)}
            onValueChange={(v) => onChange(v as number)}
          />
        </div>
      )
    case 'toggle':
      return (
        <div className="flex items-center justify-between">
          <Label className="text-xs">{control.label}</Label>
          <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />
        </div>
      )
    case 'select':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{control.label}</Label>
          <Select value={String(value)} onValueChange={(v) => onChange(v as string)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {control.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    case 'palette':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{control.label}</Label>
          <Select value={String(value)} onValueChange={(v) => onChange(v as string)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(PALETTES).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
  }
}
