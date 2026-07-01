import { Loader2 } from 'lucide-react'

/** A subtle, non-interactive "Processing…" badge shown over the preview while a
 *  slow (CPU/worker) render is in flight. */
export function ProcessingOverlay({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 rounded-md border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        <span>Processing…</span>
      </div>
    </div>
  )
}
