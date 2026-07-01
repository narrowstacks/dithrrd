import { AppShell, hasWebGL2, WebGL2Fallback } from '@/ui/AppShell'

export default function App() {
  if (!hasWebGL2()) return <WebGL2Fallback />
  return (
    <AppShell
      stack={<div className="p-3 text-sm text-muted-foreground">Stack</div>}
      viewport={<div className="p-3 text-sm text-muted-foreground">Viewport</div>}
      controls={<div className="p-3 text-sm text-muted-foreground">Controls</div>}
    />
  )
}
