import { useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { AppShell, hasWebGL2, WebGL2Fallback } from '@/ui/AppShell'
import { Toolbar } from '@/ui/Toolbar'
import { Viewport } from '@/ui/Viewport'
import { StackPanel } from '@/ui/StackPanel'
import { ControlsPanel } from '@/ui/ControlsPanel'
import { useStore } from '@/store/store'
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
  const apiRef = useRef<{ backend: Backend; runCpu: RunCpu } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get('p')
    if (!p) return
    try {
      loadPreset(decodePresetParam(p))
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

  return (
    <>
      <AppShell
        toolbar={
          <Toolbar
            onUpload={onUpload}
            onReset={() => location.reload()}
            onExport={onExport}
            canExport={!!source}
          />
        }
        stack={<StackPanel />}
        viewport={<Viewport onReady={(api) => (apiRef.current = api)} />}
        controls={<ControlsPanel />}
      />
      <Toaster position="bottom-center" />
    </>
  )
}
