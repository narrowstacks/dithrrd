import { Undo2, Redo2, Keyboard, Maximize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PresetMenu } from '@/ui/PresetMenu'
import { AppearanceMenu } from '@/ui/AppearanceMenu'
import { useTemporal, appStore } from '@/store/store'

// lucide-react has no GitHub mark; inline the standard octocat glyph.
function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.16.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.12 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  )
}

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
        <AppearanceMenu />
        <Button variant="ghost" size="icon" aria-label="GitHub repository" render={
          <a href="https://github.com/narrowstacks/dithrrd" target="_blank" rel="noreferrer noopener" />
        }>
          <GithubIcon className="size-4" />
        </Button>
        <PresetMenu />
        <Button onClick={onExport} disabled={!canExport}>Export PNG</Button>
      </div>
    </div>
  )
}
