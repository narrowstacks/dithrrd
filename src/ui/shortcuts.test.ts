import { describe, it, expect } from 'vitest'
import {
  SHORTCUTS,
  matchShortcut,
  isSingleKey,
  siblingNodeId,
  type KeyDescriptor,
} from '@/ui/shortcuts'

const d = (p: Partial<KeyDescriptor>): KeyDescriptor => ({
  key: 'a',
  meta: false,
  ctrl: false,
  shift: false,
  ...p,
})

describe('matchShortcut', () => {
  it('matches undo with ⌘Z on mac and Ctrl+Z elsewhere', () => {
    expect(matchShortcut(d({ key: 'z', meta: true }), SHORTCUTS, true)?.id).toBe('undo')
    expect(matchShortcut(d({ key: 'z', ctrl: true }), SHORTCUTS, false)?.id).toBe('undo')
  })

  it('distinguishes redo (⌘⇧Z) from undo (⌘Z)', () => {
    expect(matchShortcut(d({ key: 'z', meta: true, shift: true }), SHORTCUTS, true)?.id).toBe('redo')
  })

  it('matches single-key shortcuts without a modifier', () => {
    expect(matchShortcut(d({ key: 'e' }), SHORTCUTS, true)?.id).toBe('toggle')
    expect(matchShortcut(d({ key: 'a' }), SHORTCUTS, true)?.id).toBe('addMenu')
    expect(matchShortcut(d({ key: 'ArrowUp' }), SHORTCUTS, true)?.id).toBe('selectPrev')
    expect(matchShortcut(d({ key: '?' , shift: true }), SHORTCUTS, true)?.id).toBe('help')
  })

  it('matches zoom combos with both unshifted and shifted characters', () => {
    expect(matchShortcut(d({ key: '=' }), SHORTCUTS, true)?.id).toBe('zoomIn')
    expect(matchShortcut(d({ key: '+', shift: true }), SHORTCUTS, true)?.id).toBe('zoomIn')
    expect(matchShortcut(d({ key: '-' }), SHORTCUTS, true)?.id).toBe('zoomOut')
    expect(matchShortcut(d({ key: '_', shift: true }), SHORTCUTS, true)?.id).toBe('zoomOut')
  })

  it('does not match a bare letter as its ⌘ counterpart', () => {
    expect(matchShortcut(d({ key: 'z' }), SHORTCUTS, true)).toBeNull()
  })

  it('marks mod shortcuts as not single-key', () => {
    const undo = SHORTCUTS.find((s) => s.id === 'undo')!
    const toggle = SHORTCUTS.find((s) => s.id === 'toggle')!
    expect(isSingleKey(undo)).toBe(false)
    expect(isSingleKey(toggle)).toBe(true)
  })
})

describe('siblingNodeId', () => {
  const ids = ['a', 'b', 'c']
  it('selects the next node', () => expect(siblingNodeId(ids, 'a', 1)).toBe('b'))
  it('selects the previous node', () => expect(siblingNodeId(ids, 'b', -1)).toBe('a'))
  it('clamps at the ends', () => {
    expect(siblingNodeId(ids, 'c', 1)).toBe('c')
    expect(siblingNodeId(ids, 'a', -1)).toBe('a')
  })
  it('selects the first node when nothing is selected', () => {
    expect(siblingNodeId(ids, null, 1)).toBe('a')
    expect(siblingNodeId([], null, 1)).toBeNull()
  })
})
