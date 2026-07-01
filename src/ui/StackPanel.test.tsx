import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StackPanel } from '@/ui/StackPanel'
import { appStore } from '@/store/store'

beforeEach(() => {
  appStore.setState({ stack: [], selectedId: null })
})

describe('StackPanel', () => {
  it('adds an effect from the add menu', async () => {
    const user = userEvent.setup()
    render(<StackPanel />)
    await user.click(screen.getByRole('button', { name: /add/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Bayer Dither' }))
    expect(appStore.getState().stack).toHaveLength(1)
    expect(appStore.getState().stack[0].type).toBe('bayer')
  })

  it('removes a node via its remove button', async () => {
    const user = userEvent.setup()
    appStore.getState().addNode('bayer')
    render(<StackPanel />)
    await user.click(screen.getByRole('button', { name: /remove/i }))
    expect(appStore.getState().stack).toHaveLength(0)
  })
})
