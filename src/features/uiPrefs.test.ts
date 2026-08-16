import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadPanelPrefs,
  savePanelPrefs,
  loadViewportBgPrefs,
  saveViewportBgPrefs,
  VIEWPORT_BG_KEY,
} from '@/features/uiPrefs'

describe('panel prefs', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to both panels expanded', () => {
    expect(loadPanelPrefs()).toEqual({ left: false, right: false })
  })

  it('round-trips saved prefs', () => {
    savePanelPrefs({ left: true, right: false })
    expect(loadPanelPrefs()).toEqual({ left: true, right: false })
  })

  it('ignores malformed stored data', () => {
    localStorage.setItem('dithrrd.panels.v1', '{not json')
    expect(loadPanelPrefs()).toEqual({ left: false, right: false })
  })
})

describe('viewport background prefs', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to checkerboard', () => {
    expect(loadViewportBgPrefs()).toEqual({ preset: 'checkerboard', customColor: '#808080' })
  })

  it('round-trips saved prefs', () => {
    saveViewportBgPrefs({ preset: 'white', customColor: '#ff00ff' })
    expect(loadViewportBgPrefs()).toEqual({ preset: 'white', customColor: '#ff00ff' })
  })

  it('ignores malformed stored data', () => {
    localStorage.setItem(VIEWPORT_BG_KEY, '{not json')
    expect(loadViewportBgPrefs()).toEqual({ preset: 'checkerboard', customColor: '#808080' })
  })

  it('falls back to default when the preset is unknown', () => {
    localStorage.setItem(VIEWPORT_BG_KEY, JSON.stringify({ preset: 'rainbow', customColor: '#123456' }))
    expect(loadViewportBgPrefs()).toEqual({ preset: 'checkerboard', customColor: '#808080' })
  })

  it('falls back to default when the custom color is not a valid hex', () => {
    localStorage.setItem(VIEWPORT_BG_KEY, JSON.stringify({ preset: 'custom', customColor: 'not-a-color' }))
    expect(loadViewportBgPrefs()).toEqual({ preset: 'checkerboard', customColor: '#808080' })
  })
})
