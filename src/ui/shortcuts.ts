export type ShortcutGroup = 'Edit' | 'Stack' | 'File' | 'View' | 'Help'

export type ShortcutId =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'duplicate'
  | 'toggle'
  | 'selectPrev'
  | 'selectNext'
  | 'addMenu'
  | 'export'
  | 'collapseLeft'
  | 'collapseRight'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'zoomReset'
  | 'help'

export interface Combo {
  key: string
  mod?: boolean
  shift?: boolean
}

export interface Shortcut {
  id: ShortcutId
  label: string
  group: ShortcutGroup
  display: (mac: boolean) => string
  combos: Combo[]
}

export type ShortcutActions = Record<ShortcutId, () => void>

export interface KeyDescriptor {
  key: string
  meta: boolean
  ctrl: boolean
  shift: boolean
}

const mod = (mac: boolean) => (mac ? '⌘' : 'Ctrl+')

export const SHORTCUTS: Shortcut[] = [
  { id: 'undo', label: 'Undo', group: 'Edit', display: (m) => `${mod(m)}Z`, combos: [{ key: 'z', mod: true }] },
  { id: 'redo', label: 'Redo', group: 'Edit', display: (m) => `${mod(m)}⇧Z`, combos: [{ key: 'z', mod: true, shift: true }, { key: 'y', mod: true }] },
  { id: 'delete', label: 'Delete node', group: 'Stack', display: () => 'Del', combos: [{ key: 'Delete' }, { key: 'Backspace' }] },
  { id: 'duplicate', label: 'Duplicate node', group: 'Stack', display: (m) => `${mod(m)}D`, combos: [{ key: 'd', mod: true }] },
  { id: 'toggle', label: 'Toggle node', group: 'Stack', display: () => 'E', combos: [{ key: 'e' }] },
  { id: 'selectPrev', label: 'Select previous node', group: 'Stack', display: () => '↑', combos: [{ key: 'ArrowUp' }] },
  { id: 'selectNext', label: 'Select next node', group: 'Stack', display: () => '↓', combos: [{ key: 'ArrowDown' }] },
  { id: 'addMenu', label: 'Add effect', group: 'Stack', display: () => 'A', combos: [{ key: 'a' }] },
  { id: 'export', label: 'Export PNG', group: 'File', display: (m) => `${mod(m)}E`, combos: [{ key: 'e', mod: true }] },
  { id: 'collapseLeft', label: 'Collapse left panel', group: 'View', display: () => '[', combos: [{ key: '[' }] },
  { id: 'collapseRight', label: 'Collapse right panel', group: 'View', display: () => ']', combos: [{ key: ']' }] },
  { id: 'zoomIn', label: 'Zoom in', group: 'View', display: () => '+', combos: [{ key: '=' }, { key: '+', shift: true }] },
  { id: 'zoomOut', label: 'Zoom out', group: 'View', display: () => '-', combos: [{ key: '-' }, { key: '_', shift: true }] },
  { id: 'zoomFit', label: 'Fit to viewport', group: 'View', display: () => '0', combos: [{ key: '0' }] },
  { id: 'zoomReset', label: 'Zoom 100%', group: 'View', display: () => '1', combos: [{ key: '1' }] },
  { id: 'help', label: 'Keyboard shortcuts', group: 'Help', display: () => '?', combos: [{ key: '?', shift: true }] },
]

function comboMatches(c: Combo, d: KeyDescriptor, mac: boolean): boolean {
  const modDown = mac ? d.meta : d.ctrl
  if (!!c.mod !== modDown) return false
  if (!!c.shift !== d.shift) return false
  return c.key.toLowerCase() === d.key.toLowerCase()
}

export function matchShortcut(
  d: KeyDescriptor,
  shortcuts: Shortcut[],
  mac: boolean,
): Shortcut | null {
  for (const s of shortcuts) {
    if (s.combos.some((c) => comboMatches(c, d, mac))) return s
  }
  return null
}

export function isSingleKey(s: Shortcut): boolean {
  return s.combos.every((c) => !c.mod)
}

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

export function siblingNodeId(
  ids: string[],
  selected: string | null,
  dir: 1 | -1,
): string | null {
  if (ids.length === 0) return null
  const i = selected ? ids.indexOf(selected) : -1
  if (i < 0) return dir === 1 ? ids[0] : ids[ids.length - 1]
  const next = Math.min(ids.length - 1, Math.max(0, i + dir))
  return ids[next]
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
}

export function isModalOpen(): boolean {
  return typeof document !== 'undefined' &&
    !!document.querySelector('[role="dialog"], [role="menu"]')
}
