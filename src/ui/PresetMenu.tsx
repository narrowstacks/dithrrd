import { useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup,
} from '@/components/ui/dropdown-menu'
import { useStore } from '@/store/store'
import { buildPreset, presetToJson, parsePresetJson } from '@/features/preset'
import { encodePresetParam } from '@/features/presetUrl'
import { loadNamedPresets, addNamedPreset, deleteNamedPreset, type NamedPreset } from '@/features/presetStorage'

// Names new presets after (max existing "Preset N" number) + 1, so deleting
// then saving again doesn't reuse a number still visible in the list.
function nextPresetName(existing: NamedPreset[]): string {
  const max = existing.reduce((best, np) => {
    const m = /^Preset (\d+)$/.exec(np.name)
    return m ? Math.max(best, Number(m[1])) : best
  }, 0)
  return `Preset ${max + 1}`
}

export function PresetMenu() {
  const stack = useStore((s) => s.stack)
  const palettes = useStore((s) => s.palettes)
  const loadPreset = useStore((s) => s.loadPreset)
  const [saved, setSaved] = useState<NamedPreset[]>([])

  const current = () => buildPreset(stack, palettes)

  const onSave = () => {
    addNamedPreset(nextPresetName(saved), current())
    setSaved(loadNamedPresets())
    toast.success('Preset saved')
  }

  const onShare = () => {
    const url = `${window.location.origin}${window.location.pathname}?p=${encodePresetParam(current())}`
    navigator.clipboard?.writeText(url).then(
      () => toast.success('Share link copied'),
      () => toast.error('Could not copy link'),
    )
  }

  const onExport = () => {
    const blob = new Blob([presetToJson(current())], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dithrrd-preset.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = (file: File) => {
    file.text().then((text) => {
      try {
        loadPreset(parsePresetJson(text))
        toast.success('Preset loaded')
      } catch {
        toast.error('That file is not a valid preset')
      }
    })
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) setSaved(loadNamedPresets()) }}>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline">
            Presets <ChevronDown className="ml-1 size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onSave}>Save current</DropdownMenuItem>
        <DropdownMenuItem onClick={onShare}>Share link</DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>Export current</DropdownMenuItem>
        <DropdownMenuItem
          closeOnClick={false}
          render={
            <label>
              Import…
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Import preset"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onImport(f)
                }}
              />
            </label>
          }
        />
        {saved.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Saved</DropdownMenuLabel>
              {saved.map((np) => (
                <DropdownMenuItem
                  key={np.id}
                  onClick={() => {
                    loadPreset(np.preset)
                    toast.success(`Loaded ${np.name}`)
                  }}
                >
                  <span className="flex-1 truncate">{np.name}</span>
                  <button
                    aria-label={`Delete ${np.name}`}
                    className="ml-2 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteNamedPreset(np.id)
                      setSaved(loadNamedPresets())
                      toast.success('Preset deleted')
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
