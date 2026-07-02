import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useKeyboardShortcuts } from '@/ui/useKeyboardShortcuts'
import type { ShortcutActions } from '@/ui/shortcuts'

function makeActions(): ShortcutActions {
  const ids = [
    'undo', 'redo', 'delete', 'duplicate', 'toggle', 'selectPrev', 'selectNext',
    'addMenu', 'export', 'collapseLeft', 'collapseRight', 'zoomIn', 'zoomOut',
    'zoomFit', 'zoomReset', 'help',
  ] as const
  return Object.fromEntries(ids.map((id) => [id, vi.fn()])) as unknown as ShortcutActions
}

function Harness({ actions }: { actions: ShortcutActions }) {
  useKeyboardShortcuts(actions)
  return <input data-testid="field" />
}

describe('useKeyboardShortcuts', () => {
  it('dispatches a mod shortcut', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    expect((actions.undo as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
  })

  it('ignores a single-key shortcut while typing in an input', () => {
    const actions = makeActions()
    const { getByTestId } = render(<Harness actions={actions} />)
    const field = getByTestId('field')
    field.focus()
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    expect((actions.toggle as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('still fires mod shortcuts while typing in an input', () => {
    const actions = makeActions()
    const { getByTestId } = render(<Harness actions={actions} />)
    const field = getByTestId('field')
    field.focus()
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, ctrlKey: true, bubbles: true }))
    expect((actions.undo as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
  })

  it('ignores a single-key shortcut while a modal dialog is open, but mod shortcuts still fire', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
      expect((actions.toggle as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, ctrlKey: true }))
      expect((actions.undo as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
    } finally {
      dialog.remove()
    }
  })
})
