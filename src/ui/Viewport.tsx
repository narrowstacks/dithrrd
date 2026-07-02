import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch'
import { useStore, appStore } from '@/store/store'
import { planPasses } from '@/engine/planPasses'
import { execute } from '@/engine/execute'
import { createReglBackend, type Backend } from '@/engine/backend'
import { registry } from '@/effects/registry'
import { createRunCpu, type RunCpu } from '@/worker/runCpu'
import { ProcessingOverlay } from '@/ui/ProcessingOverlay'
import { clientToSourcePixel } from '@/features/viewportMath'

export interface ZoomApi {
  in: () => void
  out: () => void
  fit: () => void
  reset: () => void
}

interface ViewportProps {
  onReady?: (api: { backend: Backend; runCpu: RunCpu } | null) => void
  zoomApiRef?: MutableRefObject<ZoomApi | null>
  onZoomChange?: (scale: number) => void
}

export function Viewport(props: ViewportProps) {
  const { onReady, zoomApiRef, onZoomChange } = props
  const source = useStore((s) => s.source)
  const stack = useStore((s) => s.stack)
  const palettes = useStore((s) => s.palettes)
  const eyedropper = useStore((s) => s.eyedropper)
  const applyEyedropper = useStore((s) => s.applyEyedropper)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backendRef = useRef<(Backend & { dispose(): void }) | null>(null)
  const cpuRef = useRef<ReturnType<typeof createRunCpu> | null>(null)
  const rafRef = useRef<number>(0)
  const zoomRef = useRef<ReactZoomPanPinchContentRef | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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

  // Publish an imperative zoom API for toolbar controls (in/out/fit/reset).
  useEffect(() => {
    if (!zoomApiRef) return
    const fitScale = () => {
      const canvas = canvasRef.current
      const box = containerRef.current
      if (!canvas || !box) return 1
      return Math.min(box.clientWidth / canvas.width, box.clientHeight / canvas.height)
    }
    zoomApiRef.current = {
      in: () => zoomRef.current?.zoomIn(),
      out: () => zoomRef.current?.zoomOut(),
      fit: () => zoomRef.current?.centerView(fitScale()),
      reset: () => zoomRef.current?.centerView(1),
    }
    return () => {
      zoomApiRef.current = null
    }
  }, [zoomApiRef])

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropper || !source) return
    const instance = zoomRef.current?.instance
    const wrapper = instance?.wrapperComponent
    const t = instance?.state
    if (!wrapper || !t) return
    const rect = wrapper.getBoundingClientRect()
    const px = clientToSourcePixel({
      clientX: e.clientX,
      clientY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      positionX: t.positionX,
      positionY: t.positionY,
      scale: t.scale,
      width: source.width,
      height: source.height,
    })
    if (!px) return
    // Sampling uses the ORIGINAL source.image, not the dithered output.
    const i = (px.y * source.width + px.x) * 4
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
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundImage: 'repeating-conic-gradient(#00000010 0% 25%, transparent 0% 50%)',
        backgroundSize: '20px 20px',
      }}
    >
      <TransformWrapper
        ref={zoomRef}
        minScale={0.1}
        maxScale={40}
        limitToBounds={false}
        centerOnInit
        doubleClick={{ mode: 'reset' }}
        wheel={{ step: 0.15 }}
        panning={{ velocityDisabled: true }}
        onTransform={(_, state) => onZoomChange?.(state.scale)}
      >
        <TransformComponent
          wrapperClass="!h-full !w-full"
          contentClass="!h-full !w-full items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="max-h-full max-w-full object-contain shadow-sm"
            style={{ cursor: eyedropper ? 'crosshair' : undefined }}
          />
        </TransformComponent>
      </TransformWrapper>
      <ProcessingOverlay show={rendering} />
    </div>
  )
}
