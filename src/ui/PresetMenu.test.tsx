import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PresetMenu } from '@/ui/PresetMenu'
import { appStore } from '@/store/store'
import { loadNamedPresets } from '@/features/presetStorage'
import { decodePresetParam } from '@/features/presetUrl'

function reset() {
  localStorage.clear()
  const st = appStore.getState()
  for (const n of [...st.stack]) st.removeNode(n.id)
}

describe('PresetMenu', () => {
  beforeEach(reset)

  it('saves the current stack as a named preset', async () => {
    const user = userEvent.setup()
    appStore.getState().addNode('bayer')
    render(<PresetMenu />)
    await user.click(screen.getByRole('button', { name: /presets/i }))
    await user.click(await screen.findByRole('menuitem', { name: /save current/i }))
    const saved = loadNamedPresets()
    expect(saved).toHaveLength(1)
    expect(saved[0].preset.stack[0].type).toBe('bayer')
  })

  it('loads a saved preset back into the store', async () => {
    const user = userEvent.setup()
    appStore.getState().addNode('bayer')
    render(<PresetMenu />)
    await user.click(screen.getByRole('button', { name: /presets/i }))
    await user.click(await screen.findByRole('menuitem', { name: /save current/i }))
    // clear the live stack, then load the saved preset
    for (const n of [...appStore.getState().stack]) appStore.getState().removeNode(n.id)
    await user.click(screen.getByRole('button', { name: /presets/i }))
    await user.click(await screen.findByRole('menuitem', { name: /Preset 1/i }))
    expect(appStore.getState().stack[0].type).toBe('bayer')
  })

  it('copies a share link whose param decodes to the current preset', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    appStore.getState().addNode('bayer')
    render(<PresetMenu />)
    await user.click(screen.getByRole('button', { name: /presets/i }))
    await user.click(await screen.findByRole('menuitem', { name: /share link/i }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const url = writeText.mock.calls[0][0] as string
    const param = new URL(url).searchParams.get('p')!
    expect(decodePresetParam(param).stack[0].type).toBe('bayer')
  })
})
