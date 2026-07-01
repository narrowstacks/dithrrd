import { useEffect, useRef, useState } from 'react'
import { useStore, appStore } from '@/store/store'
import { planPasses } from '@/engine/planPasses'
import { execute } from '@/engine/execute'
import { createReglBackend, type Backend } from '@/engine/backend'
import { registry } from '@/effects/registry'
import { createRunCpu, type RunCpu } from '@/worker/runCpu'
import { ProcessingOverlay } from '@/ui/ProcessingOverlay'

interface ViewportProps {
  onReady?: (api: { backend: Backend; runCpu: RunCpu } | null) => void
}

export function Viewport({ onReady }: ViewportProps) {
  const source = useStore((s) => s.source)
  const stack = useStore((s) => s.stack)
  const palettes = useStore((s) => s.palettes)
  const eyedropper = useStore((s) => s.eyedropper)
  const applyEyedropper = useStore((s) => s.applyEyedropper)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backendRef = useRef<(Backend & { dispose(): void }) | null>(null)
  const cpuRef = useRef<ReturnType<typeof createRunCpu> | null>(null)
  const rafRef = useRef<number>(0)
  // Monotonic render id. Guards against presenting a superseded/older render
  // (out-of-order) or one whose backend was disposed on a source change.
  const genRef = useRef(0)
  // Latest indicator timer, tracked only so effect cleanup can cancel it.
  const indicatorTimerRef = useRef<number>(0)
  const [rendering, setRendering] = useState(false)

  // Lazily create the CPU worker client once. Declared before the source
  // effect below so cpuRef.current is already set when the backend is
  // published via onReady.
  useEffect(() => {
    cpuRef.current = createRunCpu()
    return () => {
      cpuRef.current?.dispose()
      cpuRef.current = null
    }
  }, [])

  // (Re)create the backend when the source changes.
  useEffect(() => {
    backendRef.current?.dispose()
    backendRef.current = null
    if (!source || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = source.width
    canvas.height = source.height
    backendRef.current = createReglBackend(canvas, source.image, source.width, source.height)
    if (cpuRef.current) {
      onReady?.({ backend: backendRef.current, runCpu: cpuRef.current.runCpu })
    }
    return () => {
      backendRef.current?.dispose()
      backendRef.current = null
      onReady?.(null)
    }
  }, [source])

  // Render on any state change, debounced to one rAF.
  useEffect(() => {
    if (!source) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const backend = backendRef.current
      const cpu = cpuRef.current
      if (!backend || !cpu) return
      const gen = ++genRef.current
      const steps = planPasses(stack, registry)
      // A CPU (worker) pass can be slow — notably the first, cold invocation.
      // Show a "Processing…" indicator, but only if the render is still running
      // after a short delay, so fast GPU/warm renders don't flicker it.
      const hasCpu = steps.some((s) => s.effect.kind === 'cpu')
      let indicatorTimer = 0
      if (hasCpu) {
        indicatorTimer = window.setTimeout(() => {
          if (gen === genRef.current) setRendering(true)
        }, 150)
        indicatorTimerRef.current = indicatorTimer
      }
      const done = () => {
        window.clearTimeout(indicatorTimer)
        // Only the newest render owns the indicator state.
        if (gen === genRef.current) setRendering(false)
      }
      execute(steps, backend, { runCpu: cpu.runCpu, palettes })
        .then((tex) => {
          // Drop this frame if a newer render started (out-of-order) or the
          // backend was swapped/disposed on a source change (stale closure).
          if (gen !== genRef.current || backendRef.current !== backend) return
          backend.present(tex)
        })
        .catch(() => {
          // A superseded render can reject when its backend/worker is disposed
          // mid-flight; that's expected — swallow so it isn't an unhandled rejection.
        })
        .finally(done)
    })
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(indicatorTimerRef.current)
    }
  }, [source, stack, palettes])

  // Escape-to-cancel eyedropper when armed.
  useEffect(() => {
    if (!eyedropper) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        appStore.getState().cancelEyedropper()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [eyedropper])

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropper || !source) return
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    // object-contain letterboxes: compute the drawn image rect inside the element.
    const scale = Math.min(rect.width / source.width, rect.height / source.height)
    const drawnW = source.width * scale
    const drawnH = source.height * scale
    const offX = (rect.width - drawnW) / 2
    const offY = (rect.height - drawnH) / 2
    const px = Math.floor(((e.clientX - rect.left - offX) / drawnW) * source.width)
    const py = Math.floor(((e.clientY - rect.top - offY) / drawnH) * source.height)
    if (px < 0 || py < 0 || px >= source.width || py >= source.height) {
      // out of image bounds: ignore (do not call)
      return
    }
    // Sampling uses the ORIGINAL source.image, not the dithered output.
    const i = (py * source.width + px) * 4
    const d = source.image.data
    applyEyedropper([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255])
  }

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Open an image to begin
      </div>
    )
  }

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden p-4"
      style={{
        backgroundImage:
          'repeating-conic-gradient(#00000010 0% 25%, transparent 0% 50%)',
        backgroundSize: '20px 20px',
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        className="max-h-full max-w-full object-contain shadow-sm"
        style={{ imageRendering: 'auto', cursor: eyedropper ? 'crosshair' : undefined }}
      />
      <ProcessingOverlay show={rendering} />
    </div>
  )
}
