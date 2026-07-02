import { useRef, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { AppShell, hasWebGL2, WebGL2Fallback } from '@/ui/AppShell'
import { Toolbar } from '@/ui/Toolbar'
import { Viewport, type ZoomApi } from '@/ui/Viewport'
import { StackPanel } from '@/ui/StackPanel'
import { ControlsPanel } from '@/ui/ControlsPanel'
import { ShortcutsDialog } from '@/ui/ShortcutsDialog'
import { useKeyboardShortcuts } from '@/ui/useKeyboardShortcuts'
import { siblingNodeId, type ShortcutActions } from '@/ui/shortcuts'
import { useStore, appStore } from '@/store/store'
import { decodeToWorkingImage } from '@/features/image'
import { exportCurrentPng } from '@/features/exportPng'
import { decodePresetParam } from '@/features/presetUrl'
import type { Backend } from '@/engine/backend'
import type { RunCpu } from '@/worker/runCpu'

export default function App() {
  const setSource = useStore((s) => s.setSource)
  const source = useStore((s) => s.source)
  const stack = useStore((s) => s.stack)
  const palettes = useStore((s) => s.palettes)
  const loadPreset = useStore((s) => s.loadPreset)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const setAddMenuOpen = useStore((s) => s.setAddMenuOpen)
  const togglePanel = useStore((s) => s.togglePanel)
  const apiRef = useRef<{ backend: Backend; runCpu: RunCpu } | null>(null)
  const zoomApiRef = useRef<ZoomApi | null>(null)
  const [zoomPct, setZoomPct] = useState(1)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get('p')
    if (!p) return
    try {
      loadPreset(decodePresetParam(p))
      appStore.temporal.getState().clear()
    } catch {
      toast.error('That shared link could not be loaded.')
    }
    // Strip ?p= so a reload doesn't re-apply and the URL stays clean.
    params.delete('p')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, [loadPreset])

  if (!hasWebGL2()) return <WebGL2Fallback />

  const onUpload = async (file: File) => {
    try {
      setSource(await decodeToWorkingImage(file))
      appStore.temporal.getState().clear()
    } catch {
      toast.error('Could not open that image. Try a different file.')
    }
  }

  const onExport = async () => {
    if (!apiRef.current) return
    try {
      await exportCurrentPng(apiRef.current.backend, stack, palettes, apiRef.current.runCpu)
      toast.success('Exported dithrrd.png')
    } catch {
      toast.error('Export failed.')
    }
  }

  const actions: ShortcutActions = {
    undo: () => appStore.temporal.getState().undo(),
    redo: () => appStore.temporal.getState().redo(),
    delete: () => {
      const { selectedId, removeNode } = appStore.getState()
      if (selectedId) removeNode(selectedId)
    },
    duplicate: () => {
      const { selectedId, duplicateNode } = appStore.getState()
      if (selectedId) duplicateNode(selectedId)
    },
    toggle: () => {
      const { selectedId, toggleNode } = appStore.getState()
      if (selectedId) toggleNode(selectedId)
    },
    selectPrev: () => {
      const st = appStore.getState()
      st.selectNode(siblingNodeId(st.stack.map((n) => n.id), st.selectedId, -1))
    },
    selectNext: () => {
      const st = appStore.getState()
      st.selectNode(siblingNodeId(st.stack.map((n) => n.id), st.selectedId, 1))
    },
    addMenu: () => setAddMenuOpen(true),
    export: () => void onExport(),
    collapseLeft: () => togglePanel('left'),
    collapseRight: () => togglePanel('right'),
    zoomIn: () => zoomApiRef.current?.in(),
    zoomOut: () => zoomApiRef.current?.out(),
    zoomFit: () => zoomApiRef.current?.fit(),
    zoomReset: () => zoomApiRef.current?.reset(),
    help: () => setHelpOpen(true),
  }
  useKeyboardShortcuts(actions)

  return (
    <>
      <AppShell
        toolbar={
          <Toolbar
            onUpload={onUpload}
            onReset={() => location.reload()}
            onExport={onExport}
            canExport={!!source}
            zoomPct={Math.round(zoomPct * 100)}
            onZoomFit={() => zoomApiRef.current?.fit()}
            onShowHelp={() => setHelpOpen(true)}
          />
        }
        stack={<StackPanel />}
        viewport={<Viewport onReady={(api) => (apiRef.current = api)} zoomApiRef={zoomApiRef} onZoomChange={(scale) => setZoomPct(scale)} />}
        controls={<ControlsPanel />}
      />
      <ShortcutsDialog />
      <Toaster position="bottom-center" />
    </>
  )
}
