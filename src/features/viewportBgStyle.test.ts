import { describe, it, expect } from 'vitest'
import { viewportBgStyle } from '@/features/viewportBgStyle'

describe('viewportBgStyle', () => {
  it('renders an opaque neutral checker for the checkerboard preset', () => {
    const style = viewportBgStyle({ preset: 'checkerboard', customColor: '#808080' })
    expect(style.backgroundColor).toBe('#cccccc')
    expect(style.backgroundImage).toContain('repeating-conic-gradient')
    expect(style.backgroundImage).toContain('#ffffff')
  })

  it('renders a flat color for a named preset', () => {
    expect(viewportBgStyle({ preset: 'white', customColor: '#808080' })).toEqual({
      backgroundColor: '#ffffff',
      backgroundImage: 'none',
    })
    expect(viewportBgStyle({ preset: 'black', customColor: '#808080' })).toEqual({
      backgroundColor: '#000000',
      backgroundImage: 'none',
    })
  })

  it('uses the stored custom color for the custom preset', () => {
    expect(viewportBgStyle({ preset: 'custom', customColor: '#ff00ff' })).toEqual({
      backgroundColor: '#ff00ff',
      backgroundImage: 'none',
    })
  })
})
