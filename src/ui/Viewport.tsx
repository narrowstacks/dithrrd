import { useEffect, useRef } from 'react'
import { useStore } from '@/store/store'
import { planPasses } from '@/engine/planPasses'
import { execute } from '@/engine/execute'
import { createReglBackend, type Backend } from '@/engine/backend'
import { registry } from '@/effects/registry'
import { createRunCpu, type RunCpu } from '@/worker/runCpu'

interface ViewportProps {
  onReady?: (api: { backend: Backend; runCpu: RunCpu } | null) => void
}

export function Viewport({ onReady }: ViewportProps) {
  const source = useStore((s) => s.source)
  const stack = useStore((s) => s.stack)
  const palettes = useStore((s) => s.palettes)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backendRef = useRef<(Backend & { dispose(): void }) | null>(null)
  const cpuRef = useRef<ReturnType<typeof createRunCpu> | null>(null)
  const rafRef = useRef<number>(0)
  // Monotonic render id. Guards against presenting a superseded/older render
  // (out-of-order) or one whose backend was disposed on a source change.
  const genRef = useRef(0)

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
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [source, stack, palettes])

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Open an image to begin
      </div>
    )
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden p-4"
      style={{
        backgroundImage:
          'repeating-conic-gradient(#00000010 0% 25%, transparent 0% 50%)',
        backgroundSize: '20px 20px',
      }}
    >
      <canvas
        ref={canvasRef}
        className="max-h-full max-w-full object-contain shadow-sm"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  )
}
