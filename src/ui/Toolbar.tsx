import { Button } from '@/components/ui/button'

interface ToolbarProps {
  onUpload: (file: File) => void
  onReset: () => void
  onExport: () => void
  canExport: boolean
}

export function Toolbar({ onUpload, onReset, onExport, canExport }: ToolbarProps) {
  return (
    <div className="flex h-12 items-center justify-between border-b px-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold tracking-tight">dithrrd</span>
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
        <Button onClick={onExport} disabled={!canExport}>Export PNG</Button>
      </div>
    </div>
  )
}
