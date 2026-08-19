import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PresetMenu } from '@/ui/PresetMenu'
import { appStore } from '@/store/store'
import { loadNamedPresets } from '@/features/presetStorage'
import { decodePresetParam } from '@/features/presetUrl'
import { toast } from 'sonner'

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

  it('reports an error instead of throwing when the preset cannot be encoded', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    // An imported preset JSON may carry a palette with no colors, which the
    // short-link format cannot represent.
    appStore.getState().loadPreset({
      v: 1,
      stack: [{ id: 'a', type: 'palette', enabled: true, params: { paletteId: 'c1' } }],
      palettes: [{ id: 'c1', name: 'Empty', colors: [] }],
    })
    const error = vi.spyOn(toast, 'error').mockImplementation(() => '')
    render(<PresetMenu />)
    await user.click(screen.getByRole('button', { name: /presets/i }))
    await user.click(await screen.findByRole('menuitem', { name: /share link/i }))
    expect(writeText).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/share link/i))
    error.mockRestore()
  })

  it('imports a preset file even though the menu closes on click', async () => {
    const user = userEvent.setup()
    render(<PresetMenu />)
    await user.click(screen.getByRole('button', { name: /presets/i }))
    const input = await screen.findByLabelText(/import preset/i)
    const json = JSON.stringify({
      v: 1,
      stack: [{ id: 'x', type: 'bayer', enabled: true, params: { levels: 3 } }],
      palettes: [],
    })
    const file = new File([json], 'preset.json', { type: 'application/json' })
    // Mock text() method for jsdom compatibility (see PaletteControl.test.tsx).
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) })
    fireEvent.change(input, { target: { files: [file] } })
    await vi.waitFor(() => {
      expect(appStore.getState().stack[0]?.type).toBe('bayer')
    })
  })

  it('keeps the saved-preset list current and avoids reusing names across a session', async () => {
    const user = userEvent.setup()
    appStore.getState().addNode('bayer')
    render(<PresetMenu />)

    await user.click(screen.getByRole('button', { name: /presets/i }))
    await user.click(await screen.findByRole('menuitem', { name: /save current/i }))

    await user.click(screen.getByRole('button', { name: /presets/i }))
    await user.click(await screen.findByRole('menuitem', { name: /save current/i }))

    const saved = loadNamedPresets()
    expect(saved).toHaveLength(2)
    expect(saved.map((np) => np.name).sort()).toEqual(['Preset 1', 'Preset 2'])
  })
})
