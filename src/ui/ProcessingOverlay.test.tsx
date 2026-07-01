import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProcessingOverlay } from '@/ui/ProcessingOverlay'

describe('ProcessingOverlay', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<ProcessingOverlay show={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a processing message when show is true', () => {
    render(<ProcessingOverlay show={true} />)
    expect(screen.getByText('Processing…')).toBeInTheDocument()
  })
})
