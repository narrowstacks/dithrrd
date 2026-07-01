import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell, hasWebGL2 } from '@/ui/AppShell'

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
