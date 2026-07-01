import { useEffect, useRef } from 'react'
import {
  SHORTCUTS,
  matchShortcut,
  isSingleKey,
  isEditableTarget,
  isMac,
  type ShortcutActions,
} from '@/ui/shortcuts'

export function useKeyboardShortcuts(actions: ShortcutActions, enabled = true): void {
  // Keep the latest actions without re-binding the listener each render.
  const ref = useRef(actions)
  ref.current = actions

  useEffect(() => {
    if (!enabled) return
    const mac = isMac()
    const onKeyDown = (e: KeyboardEvent) => {
      const sc = matchShortcut(
        { key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey },
        SHORTCUTS,
        mac,
      )
      if (!sc) return
      if (isSingleKey(sc) && isEditableTarget(e.target)) return
      e.preventDefault()
      ref.current[sc.id]?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
