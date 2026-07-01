import { AppShell, hasWebGL2, WebGL2Fallback } from '@/ui/AppShell'
import { Toolbar } from '@/ui/Toolbar'
import { Viewport } from '@/ui/Viewport'
import { useStore } from '@/store/store'
import { decodeToWorkingImage } from '@/features/image'

export default function App() {
  const setSource = useStore((s) => s.setSource)
  const source = useStore((s) => s.source)

  if (!hasWebGL2()) return <WebGL2Fallback />

  const onUpload = async (file: File) => {
    try {
      setSource(await decodeToWorkingImage(file))
    } catch {
      // Task 16 replaces this with a toast; keep the previous image on failure.
    }
  }

  return (
    <AppShell
      toolbar={
        <Toolbar
          onUpload={onUpload}
          onReset={() => location.reload()}
          onExport={() => {}}
          canExport={!!source}
        />
      }
      stack={<div className="p-3 text-sm text-muted-foreground">Stack</div>}
      viewport={<Viewport />}
      controls={<div className="p-3 text-sm text-muted-foreground">Controls</div>}
    />
  )
}
