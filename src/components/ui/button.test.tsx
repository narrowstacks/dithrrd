import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Export</Button>)
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })
})
