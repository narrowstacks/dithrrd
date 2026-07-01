import { ChevronDown, Copy, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useStore } from '@/store/store'
import { EFFECT_LIST } from '@/effects/registry'
import type { Family } from '@/effects/types'

const FAMILY_LABEL: Record<Family, string> = {
  color: 'Color',
  pixelate: 'Pixelate',
  ordered: 'Ordered',
  halftone: 'Halftone',
  diffusion: 'Error Diffusion',
}
const FAMILY_ORDER: Family[] = ['color', 'pixelate', 'ordered', 'halftone', 'diffusion']

export function StackPanel() {
  const stack = useStore((s) => s.stack)
  const selectedId = useStore((s) => s.selectedId)
  const addNode = useStore((s) => s.addNode)
  const removeNode = useStore((s) => s.removeNode)
  const toggleNode = useStore((s) => s.toggleNode)
  const reorderNode = useStore((s) => s.reorderNode)
  const duplicateNode = useStore((s) => s.duplicateNode)
  const selectNode = useStore((s) => s.selectNode)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Effects
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="outline">
                Add <ChevronDown className="ml-1 size-3" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {FAMILY_ORDER.map((family) => {
              const items = EFFECT_LIST.filter((e) => e.family === family)
              if (items.length === 0) return null
              return (
                <DropdownMenuGroup key={family}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {FAMILY_LABEL[family]}
                  </DropdownMenuLabel>
                  {items.map((e) => (
                    <DropdownMenuItem key={e.type} onClick={() => addNode(e.type)}>
                      {e.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </DropdownMenuGroup>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-1 p-2">
          {stack.length === 0 && (
            <li className="px-1 py-6 text-center text-xs text-muted-foreground">
              No effects yet. Use “Add” to stack one.
            </li>
          )}
          {stack.map((node, i) => {
            const def = EFFECT_LIST.find((e) => e.type === node.type)
            const isSelected = node.id === selectedId
            return (
              <li
                key={node.id}
                onClick={() => selectNode(node.id)}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                  isSelected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/50'
                }`}
              >
                <Switch
                  checked={node.enabled}
                  onCheckedChange={() => toggleNode(node.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Toggle effect"
                />
                <span className="flex-1 truncate">{def?.name ?? node.type}</span>
                <button
                  aria-label="Move up"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === 0}
                  onClick={(e) => {
                    e.stopPropagation()
                    reorderNode(i, i - 1)
                  }}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  aria-label="Move down"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === stack.length - 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    reorderNode(i, i + 1)
                  }}
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  aria-label="Duplicate"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    duplicateNode(node.id)
                  }}
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  aria-label="Remove"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeNode(node.id)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      </ScrollArea>
    </div>
  )
}
