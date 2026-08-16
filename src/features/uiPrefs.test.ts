import { describe, it, expect, beforeEach } from 'vitest'
import { loadPanelPrefs, savePanelPrefs } from '@/features/uiPrefs'

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
