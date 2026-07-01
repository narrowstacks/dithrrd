import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaletteEditor } from '@/ui/PaletteEditor'
import { appStore } from '@/store/store'

function resetToBuiltins() {
  for (const id of Object.keys(appStore.getState().palettes)) appStore.getState().removePalette(id)
}

describe('PaletteEditor', () => {
  beforeEach(resetToBuiltins)

  it('renders a hex input per swatch for a custom palette', () => {
    const id = appStore.getState().addPalette() // [black, white]
    render(<PaletteEditor paletteId={id} />)
    const inputs = screen.getAllByLabelText(/swatch \d+ hex/i)
    expect(inputs).toHaveLength(2)
    expect((inputs[0] as HTMLInputElement).value).toBe('#000000')
    expect((inputs[1] as HTMLInputElement).value).toBe('#ffffff')
  })

  it('commits a valid hex edit to the store on change', () => {
    const id = appStore.getState().addPalette()
    render(<PaletteEditor paletteId={id} />)
    const first = screen.getAllByLabelText(/swatch 1 hex/i)[0]
    fireEvent.change(first, { target: { value: '#ff0000' } })
    expect(appStore.getState().palettes[id].colors[0]).toEqual([1, 0, 0])
  })

  it('adds and removes swatches (clamped 1..16)', () => {
    const id = appStore.getState().addPalette() // 2 swatches
    render(<PaletteEditor paletteId={id} />)
    fireEvent.click(screen.getByRole('button', { name: /add swatch/i }))
    expect(appStore.getState().palettes[id].colors).toHaveLength(3)
    fireEvent.click(screen.getAllByRole('button', { name: /remove swatch/i })[0])
    expect(appStore.getState().palettes[id].colors).toHaveLength(2)
  })

  it('reorders a swatch with the move button', () => {
    const id = appStore.getState().addPalette()
    appStore.getState().updatePalette(id, { colors: [[1, 0, 0], [0, 1, 0]] })
    render(<PaletteEditor paletteId={id} />)
    fireEvent.click(screen.getAllByRole('button', { name: /move swatch right/i })[0])
    expect(appStore.getState().palettes[id].colors).toEqual([[0, 1, 0], [1, 0, 0]])
  })

  it('renders built-ins read-only with a duplicate hint', () => {
    render(<PaletteEditor paletteId="gameboy" />)
    expect(screen.queryAllByLabelText(/swatch \d+ hex/i)).toHaveLength(0)
    expect(screen.getByText(/duplicate/i)).toBeInTheDocument()
  })

  it('toggles eyedropper on and off by clicking the same swatch button', () => {
    const id = appStore.getState().addPalette()
    render(<PaletteEditor paletteId={id} />)
    const eyedropButtons = screen.getAllByRole('button', { name: /eyedrop swatch/i })
    // Click to start eyedropper on swatch 1
    fireEvent.click(eyedropButtons[0])
    expect(appStore.getState().eyedropper).toEqual({ paletteId: id, index: 0 })
    // Click the same button again to cancel
    fireEvent.click(eyedropButtons[0])
    expect(appStore.getState().eyedropper).toBeNull()
  })
})
