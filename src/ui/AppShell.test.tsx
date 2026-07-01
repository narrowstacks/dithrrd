import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from '@/ui/AppShell'

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
