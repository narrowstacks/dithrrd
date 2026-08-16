import { useEffect, useRef, type ReactNode } from 'react'
import { type PanelImperativeHandle } from 'react-resizable-panels'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { useStore } from '@/store/store'

// Probe for WebGL2 support exactly once. This is called on every App render, and each
// getContext('webgl2') would create a real (never-freed) WebGL context — after ~16 the
// browser evicts the live render context ("too many active WebGL contexts"), breaking
// the preview. Cache the boolean and release the probe context immediately.
let webgl2Supported: boolean | undefined

export function hasWebGL2(): boolean {
  if (webgl2Supported === undefined) {
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2')
      webgl2Supported = !!gl
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      webgl2Supported = false
    }
  }
  return webgl2Supported
}

interface AppShellProps {
  toolbar?: ReactNode
  stack: ReactNode
  viewport: ReactNode
  controls: ReactNode
}

export function AppShell({ toolbar, stack, viewport, controls }: AppShellProps) {
  const panels = useStore((s) => s.panels)
  const setPanelCollapsed = useStore((s) => s.setPanelCollapsed)
  const leftRef = useRef<PanelImperativeHandle>(null)
  const rightRef = useRef<PanelImperativeHandle>(null)
  const lastReported = useRef({ left: panels.left, right: panels.right })

  // Only report a collapse change when it actually differs from the last reported
  // state. onResize fires on every ResizeObserver tick (including a mount-time call
  // with prevPanelSize: undefined), and setPanelCollapsed always allocates a new
  // panels object, which would otherwise re-render AppShell and write to
  // localStorage on every ordinary drag tick.
  const reportCollapsed = (side: 'left' | 'right', collapsed: boolean) => {
    if (lastReported.current[side] === collapsed) return
    lastReported.current[side] = collapsed
    setPanelCollapsed(side, collapsed)
  }

  // Drive the panels imperatively from store state.
  useEffect(() => {
    const l = leftRef.current
    if (l) panels.left ? l.collapse() : l.expand()
  }, [panels.left])
  useEffect(() => {
    const r = rightRef.current
    if (r) panels.right ? r.collapse() : r.expand()
  }, [panels.right])

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel
          panelRef={leftRef}
          collapsible
          collapsedSize={0}
          defaultSize={panels.left ? 0 : 20}
          minSize={14}
          onResize={(size) => reportCollapsed('left', size.asPercentage <= 0)}
        >
          <div data-testid="stack-region" className="h-full overflow-hidden border-r">
            {stack}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={56}>
          <div data-testid="viewport-region" className="h-full overflow-hidden">
            {viewport}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          panelRef={rightRef}
          collapsible
          collapsedSize={0}
          defaultSize={panels.right ? 0 : 24}
          minSize={16}
          onResize={(size) => reportCollapsed('right', size.asPercentage <= 0)}
        >
          <div data-testid="controls-region" className="h-full overflow-hidden border-l">
            {controls}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

export function WebGL2Fallback() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      This tool requires WebGL2, which your browser or device does not support.
    </div>
  )
}
