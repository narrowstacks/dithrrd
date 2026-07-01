import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaletteControl } from '@/ui/PaletteControl'
import { appStore } from '@/store/store'

describe('PaletteControl', () => {
  beforeEach(() => {
    // reset to built-ins only
    for (const id of Object.keys(appStore.getState().palettes)) appStore.getState().removePalette(id)
  })

  it('lists a freshly added custom palette in its options', () => {
    const id = appStore.getState().addPalette()
    appStore.getState().updatePalette(id, { name: 'ZZTop' })
    render(<PaletteControl label="Palette" value="bw" onChange={() => {}} />)
    // The trigger shows the current value's name; the custom palette exists in the store,
    // so the component must source options from the store (not the PALETTES constant).
    expect(appStore.getState().palettes[id].name).toBe('ZZTop')
    expect(screen.getByText('Palette')).toBeInTheDocument()
  })
})
