import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ControlsPanel } from '@/ui/ControlsPanel'
import { appStore } from '@/store/store'

beforeEach(() => {
  appStore.setState({ stack: [], selectedId: null })
})

describe('ControlsPanel', () => {
  it('prompts to select a node when nothing is selected', () => {
    render(<ControlsPanel />)
    expect(screen.getByText(/select an effect/i)).toBeInTheDocument()
  })

  it('renders a labeled control per param of the selected effect', () => {
    appStore.getState().addNode('bayer') // controls: matrix (select), levels (slider)
    render(<ControlsPanel />)
    expect(screen.getByText('Matrix')).toBeInTheDocument()
    expect(screen.getByText('Levels')).toBeInTheDocument()
    // Base UI's Slider thumb wraps a native `<input type="range">`, which carries the
    // implicit "slider" role. In jsdom, Base UI keeps the thumb visually hidden
    // (visibility: hidden) until it can measure layout via getBoundingClientRect, which
    // jsdom never provides — so the accessibility tree hides it from a default
    // getByRole query. Query with { hidden: true } to see past that jsdom limitation
    // while still asserting on the real rendered control (not a no-op).
    expect(screen.getAllByRole('slider', { hidden: true }).length).toBeGreaterThanOrEqual(1)
  })
})
