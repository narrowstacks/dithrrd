import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toolbar } from '@/ui/Toolbar'
import { appStore } from '@/store/store'

function reset() {
  const st = appStore.getState()
  for (const n of [...st.stack]) st.removeNode(n.id)
  appStore.temporal.getState().clear()
}

const noop = () => {}

describe('Toolbar undo/redo', () => {
  beforeEach(reset)

  it('disables undo and redo with empty history', () => {
    render(<Toolbar onUpload={noop} onReset={noop} onExport={noop} canExport={false} />)
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled()
  })

  it('enables undo after an edit and undoes on click', async () => {
    const user = userEvent.setup()
    render(<Toolbar onUpload={noop} onReset={noop} onExport={noop} canExport={false} />)
    appStore.getState().addNode('bayer')
    // handleSet debounce commits after 400ms; flush by pushing state directly
    appStore.temporal.getState().pastStates.length === 0 &&
      appStore.temporal.setState({
        pastStates: [{ stack: [], palettes: appStore.getState().palettes }],
      } as never)
    const undo = await screen.findByRole('button', { name: /undo/i })
    expect(undo).toBeEnabled()
    await user.click(undo)
    expect(appStore.getState().stack).toHaveLength(0)
  })
})
