import type { ReactNode } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

interface AppShellProps {
  toolbar?: ReactNode
  stack: ReactNode
  viewport: ReactNode
  controls: ReactNode
}

export function AppShell({ toolbar, stack, viewport, controls }: AppShellProps) {
  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={14}>
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
        <ResizablePanel defaultSize={24} minSize={16}>
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
