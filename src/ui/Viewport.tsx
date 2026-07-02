import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
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
  // Scale at which the whole image fits the viewport. Doubles as the zoom-out
  // floor (minScale) so the image can never be shrunk into the void. Recomputed
  // on source change and container resize (see the ResizeObserver effect below).
  const [fitScale, setFitScale] = useState(1)

  // fitScale = min(container/source) in each axis. Reads the canvas' natural
  // pixel dims (set to source.width/height by the backend effect) and the live
  // container size straight from the DOM, so it is never stale.
  const computeFit = () => {
    const box = containerRef.current
    const canvas = canvasRef.current
    if (!box || !canvas || !canvas.width || !canvas.height) return 1
    const w = box.clientWidth
    const h = box.clientHeight
    if (!w || !h) return 1
    return Math.min(w / canvas.width, h / canvas.height)
  }

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

  // Fit-and-center on image load AND on viewport resize. A ResizeObserver on the
  // container fires once right after mount (initial fit) and again on every
  // resize; each time we recompute the fit scale (which also becomes the new
  // minScale floor) and re-center the image at that scale. This does not touch
  // the rAF render effect (deps [source, stack, palettes]) — it only updates
  // fitScale state + the library transform, so the WebGL canvas is not remounted.
  useEffect(() => {
    if (!source) return
    const box = containerRef.current
    if (!box) return
    const ro = new ResizeObserver(() => {
      const s = computeFit()
      setFitScale(s)
      zoomRef.current?.centerView(s, 0)
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [source])

  // Center/fit synchronously BEFORE paint on a source change, to avoid a
  // one-frame flash of the canvas at scale 1 pinned to the wrapper's top-left
  // (the ResizeObserver below only centers on its async callback). The backend
  // effect that sizes the canvas is a passive effect and thus runs AFTER this
  // layout effect, so we size the canvas here from the known source dims first
  // (same value the backend effect will set) so computeFit() isn't reading a
  // zero/stale canvas. This only pokes the library transform (imperative) — the
  // one setFitScale keeps minScale in sync and is keyed on [source], so it
  // settles in a single pass and cannot form a transform→state→resize loop.
  useLayoutEffect(() => {
    if (!source) return
    if (!zoomRef.current || !containerRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    if (canvas.width !== source.width) canvas.width = source.width
    if (canvas.height !== source.height) canvas.height = source.height
    const s = computeFit()
    setFitScale(s)
    zoomRef.current.centerView(s, 0)
  }, [source])

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
    zoomApiRef.current = {
      in: () => zoomRef.current?.zoomIn(),
      out: () => zoomRef.current?.zoomOut(),
      fit: () => zoomRef.current?.centerView(computeFit()),
      // Fit-aware 100%: for large images fitScale<1 so this is a true 100%; for
      // images smaller than the viewport it clamps up to the fit floor so reset
      // can never shrink the image below "whole image fits" (the library's
      // built-in reset ignores minScale/checkZoomBounds).
      reset: () => zoomRef.current?.centerView(Math.max(1, computeFit())),
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
        minScale={fitScale}
        maxScale={Math.max(fitScale, 1) * 20}
        limitToBounds
        centerZoomedOut
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.15 }}
        panning={{ velocityDisabled: true }}
        onTransform={(_, state) => {
          onZoomChange?.(state.scale)
          // Imperative style poke (no React state) so zooming never re-runs the
          // rAF render effect: crisp pixels when magnified past natural size,
          // smooth resampling when fit/shrunk below it.
          const canvas = canvasRef.current
          if (canvas) canvas.style.imageRendering = state.scale > 1 ? 'pixelated' : 'auto'
        }}
      >
        <TransformComponent wrapperClass="!h-full !w-full">
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="shadow-sm"
            style={{ cursor: eyedropper ? 'crosshair' : undefined }}
          />
        </TransformComponent>
      </TransformWrapper>
      <ProcessingOverlay show={rendering} />
    </div>
  )
}
