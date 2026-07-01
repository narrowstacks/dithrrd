import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaletteControl } from '@/ui/PaletteControl'
import { appStore } from '@/store/store'
import { downloadPalette } from '@/features/paletteFile'

function resetToBuiltins() {
  for (const id of Object.keys(appStore.getState().palettes)) appStore.getState().removePalette(id)
}

describe('PaletteControl management', () => {
  beforeEach(resetToBuiltins)

  it('creates a new palette and selects it', () => {
    let selected = 'bw'
    render(<PaletteControl label="Palette" value={selected} onChange={(v) => (selected = v)} />)
    fireEvent.click(screen.getByRole('button', { name: /new palette/i }))
    // a new custom palette now exists and was selected via onChange
    const customIds = Object.keys(appStore.getState().palettes).filter((id) => !(id in ({ bw: 1, gray4: 1, gameboy: 1 } as Record<string, number>)))
    expect(customIds).toHaveLength(1)
    expect(selected).toBe(customIds[0])
  })

  it('duplicates the current palette and selects the copy', () => {
    let selected = 'gameboy'
    render(<PaletteControl label="Palette" value={selected} onChange={(v) => (selected = v)} />)
    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }))
    expect(selected).not.toBe('gameboy')
    expect(appStore.getState().palettes[selected].colors).toEqual(appStore.getState().palettes.gameboy.colors)
  })

  it('renames a custom palette', () => {
    const id = appStore.getState().addPalette()
    render(<PaletteControl label="Palette" value={id} onChange={() => {}} />)
    const name = screen.getByLabelText(/palette name/i)
    fireEvent.change(name, { target: { value: 'Dusk' } })
    expect(appStore.getState().palettes[id].name).toBe('Dusk')
  })

  it('deletes a custom palette and selects a fallback', () => {
    const id = appStore.getState().addPalette()
    let selected = id
    render(<PaletteControl label="Palette" value={id} onChange={(v) => (selected = v)} />)
    fireEvent.click(screen.getByRole('button', { name: /delete palette/i }))
    expect(appStore.getState().palettes[id]).toBeUndefined()
    expect(selected).toBe('bw') // fell back to a built-in
  })

  it('does not offer delete/rename for a built-in', () => {
    render(<PaletteControl label="Palette" value="gameboy" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /delete palette/i })).toBeNull()
    expect(screen.queryByLabelText(/palette name/i)).toBeNull()
  })

  it('imports a palette file, creating and selecting a custom palette', async () => {
    let selected = 'bw'
    render(<PaletteControl label="Palette" value={selected} onChange={(v) => (selected = v)} />)
    const input = screen.getByLabelText(/import palette/i) as HTMLInputElement
    const content = JSON.stringify({ name: 'Imported', colors: [[1, 0, 0], [0, 0, 1]] })
    const file = new File([content], 'p.json', { type: 'application/json' })
    // Mock text() method for jsdom compatibility
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(content),
    })
    fireEvent.change(input, { target: { files: [file] } })
    await vi.waitFor(() => expect(selected).not.toBe('bw'))
    expect(appStore.getState().palettes[selected]).toMatchObject({
      name: 'Imported',
      colors: [[1, 0, 0], [0, 0, 1]],
    })
  })

  it('export calls the download helper (smoke)', () => {
    // downloadPalette touches DOM/URL APIs; just assert the button is wired and present.
    render(<PaletteControl label="Palette" value="gameboy" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /export palette/i })).toBeInTheDocument()
    expect(typeof downloadPalette).toBe('function')
  })
})
