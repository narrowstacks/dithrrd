import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ShortcutsDialog } from '@/ui/ShortcutsDialog'
import { appStore } from '@/store/store'

describe('ShortcutsDialog', () => {
  beforeEach(() => act(() => appStore.getState().setHelpOpen(false)))

  it('is hidden until helpOpen is set', () => {
    render(<ShortcutsDialog />)
    expect(screen.queryByText(/keyboard shortcuts/i)).not.toBeInTheDocument()
  })

  it('lists shortcut groups when open', async () => {
    render(<ShortcutsDialog />)
    act(() => appStore.getState().setHelpOpen(true))
    expect(await screen.findByText('Undo')).toBeInTheDocument()
    expect(screen.getByText('Zoom in')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })
})
