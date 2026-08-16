import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AppShell, hasWebGL2 } from '@/ui/AppShell'
import { appStore } from '@/store/store'

describe('AppShell', () => {
  it('renders the three editor regions', () => {
    render(
      <AppShell
        stack={<div>stack</div>}
        viewport={<div>viewport</div>}
        controls={<div>controls</div>}
      />,
    )
    expect(screen.getByTestId('stack-region')).toBeInTheDocument()
    expect(screen.getByTestId('viewport-region')).toBeInTheDocument()
    expect(screen.getByTestId('controls-region')).toBeInTheDocument()
  })
})

describe('hasWebGL2', () => {
  it('probes for a WebGL2 context at most once, however many times it is called', () => {
    // App calls hasWebGL2() on every render; probing per-call would leak a WebGL context
    // each time and eventually exhaust the browser's context cap.
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    hasWebGL2()
    hasWebGL2()
    hasWebGL2()
    const webgl2Probes = spy.mock.calls.filter((c) => c[0] === 'webgl2').length
    expect(webgl2Probes).toBeLessThanOrEqual(1)
    spy.mockRestore()
  })
})

// react-resizable-panels' real Panel only reflects collapse in the DOM after a
// ResizeObserver-driven layout commit, which jsdom cannot perform (this project
// stubs ResizeObserver as a no-op in vitest.setup.ts, since jsdom has no layout
// engine). Verified by hand: even with defaultSize={0} baked in from the first
// render, the real Panel's rendered flex-grow stays at the even 3-way-split
// fallback and never reflects collapsedSize/collapse()/expand() in this
// environment — so neither `data-panel-size` nor a `data-panel-collapsed`
// attribute exists or updates on the real component under jsdom, regardless of
// what AppShell does. To still genuinely exercise AppShell's collapse wiring,
// replace Panel with a lightweight stand-in that keeps collapse state in real
// React state (so imperative collapse()/expand() calls actually cause a
// re-render, like the real component promises) and mirrors it into a
// `data-panel-collapsed` attribute we can assert on.
const { capturedOnResize } = vi.hoisted(() => ({
  capturedOnResize: [] as Array<
    (size: { asPercentage: number; inPixels: number }) => void
  >,
}))

vi.mock('react-resizable-panels', async (importOriginal) => {
  const { useState, useEffect } = await import('react')
  const actual = await importOriginal<typeof import('react-resizable-panels')>()
  return {
    ...actual,
    Panel: ({ panelRef, onResize, children, ...rest }: any) => {
      const [collapsed, setCollapsed] = useState(false)
      useEffect(() => {
        if (panelRef) {
          panelRef.current = {
            collapse: () => setCollapsed(true),
            expand: () => setCollapsed(false),
            isCollapsed: () => collapsed,
            getSize: () => ({ asPercentage: collapsed ? 0 : 100, inPixels: 0 }),
            resize: () => {},
          }
        }
        if (onResize) capturedOnResize.push(onResize)
      }, [])
      return (
        <div data-panel="true" data-panel-collapsed={collapsed ? 'true' : 'false'} {...rest}>
          {children}
        </div>
      )
    },
  }
})

describe('AppShell collapsible side panels', () => {
  beforeEach(() => {
    capturedOnResize.length = 0
  })

  it('collapses the left panel when panels.left is set', () => {
    act(() => appStore.getState().setPanelCollapsed('left', false))
    render(
      <AppShell
        toolbar={<div>tb</div>}
        stack={<div>stack-content</div>}
        viewport={<div>vp</div>}
        controls={<div>controls-content</div>}
      />,
    )
    const region = screen.getByTestId('stack-region')
    expect(region).toBeInTheDocument()
    expect(region.closest('[data-panel]')).toHaveAttribute('data-panel-collapsed', 'false')
    act(() => appStore.getState().setPanelCollapsed('left', true))
    expect(region.closest('[data-panel]')).toHaveAttribute('data-panel-collapsed', 'true')
  })

  it('expands the right panel again when panels.right is cleared', () => {
    act(() => appStore.getState().setPanelCollapsed('right', true))
    render(
      <AppShell
        toolbar={<div>tb</div>}
        stack={<div>stack-content</div>}
        viewport={<div>vp</div>}
        controls={<div>controls-content</div>}
      />,
    )
    const region = screen.getByTestId('controls-region')
    expect(region.closest('[data-panel]')).toHaveAttribute('data-panel-collapsed', 'true')
    act(() => appStore.getState().setPanelCollapsed('right', false))
    expect(region.closest('[data-panel]')).toHaveAttribute('data-panel-collapsed', 'false')
  })

  it('reports a drag-driven collapse of the left panel back to the store', () => {
    act(() => appStore.getState().setPanelCollapsed('left', false))
    render(
      <AppShell
        toolbar={<div>tb</div>}
        stack={<div>stack-content</div>}
        viewport={<div>vp</div>}
        controls={<div>controls-content</div>}
      />,
    )
    const [leftOnResize] = capturedOnResize
    act(() => leftOnResize({ asPercentage: 0, inPixels: 0 }))
    expect(appStore.getState().panels.left).toBe(true)
  })
})
