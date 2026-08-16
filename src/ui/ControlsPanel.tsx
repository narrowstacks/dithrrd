import { ScrollArea } from '@/components/ui/scroll-area'
import { useStore } from '@/store/store'
import { registry } from '@/effects/registry'
import { Control } from '@/ui/Control'
import { effectIcon } from '@/ui/effectIcons'

export function ControlsPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const stack = useStore((s) => s.stack)
  const updateParam = useStore((s) => s.updateParam)

  const node = stack.find((n) => n.id === selectedId) ?? null
  const effect = node ? registry[node.type] : null

  if (!node || !effect) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        Select an effect to edit its controls
      </div>
    )
  }

  const Icon = effectIcon(effect.type)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {effect.name}
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-3">
          {effect.controls.map((control) => (
            <Control
              key={control.key}
              control={control}
              value={node.params[control.key]}
              onChange={(v) => updateParam(node.id, control.key, v)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
