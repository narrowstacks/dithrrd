import { Undo2, Redo2, Keyboard, Maximize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PresetMenu } from '@/ui/PresetMenu'
import { useTemporal, appStore } from '@/store/store'

interface ToolbarProps {
  onUpload: (file: File) => void
  onReset: () => void
  onExport: () => void
  canExport: boolean
  zoomPct: number
  onZoomFit: () => void
  onShowHelp: () => void
}

export function Toolbar({ onUpload, onReset, onExport, canExport, zoomPct, onZoomFit, onShowHelp }: ToolbarProps) {
  const canUndo = useTemporal((t) => t.pastStates.length > 0)
  const canRedo = useTemporal((t) => t.futureStates.length > 0)

  return (
    <div className="flex h-12 items-center justify-between border-b px-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold tracking-tight">dithrrd</span>
        <span className="ml-2 tabular-nums text-xs text-muted-foreground">{zoomPct}%</span>
        <Button variant="ghost" size="sm" onClick={onZoomFit}>
          <Maximize className="mr-1 size-3.5" /> Fit
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.target.value = ''
            }}
          />
          <span className="inline-flex h-9 items-center rounded-md border px-3 hover:bg-accent">
            Open image
          </span>
        </label>
        <Button variant="ghost" onClick={onReset}>Reset</Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={() => appStore.temporal.getState().undo()}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={() => appStore.temporal.getState().redo()}
        >
          <Redo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" onClick={onShowHelp}>
          <Keyboard className="size-4" />
        </Button>
        <PresetMenu />
        <Button onClick={onExport} disabled={!canExport}>Export PNG</Button>
      </div>
    </div>
  )
}
