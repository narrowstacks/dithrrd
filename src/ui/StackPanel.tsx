import { ChevronDown, Copy, Trash2, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { effectIcon } from '@/ui/effectIcons'
import type { Family } from '@/effects/types'
import type { StackNode } from '@/engine/planPasses'
import { dragEndIndices } from '@/ui/sortable'

const FAMILY_LABEL: Record<Family, string> = {
  color: 'Color',
  pixelate: 'Pixelate',
  ordered: 'Ordered',
  halftone: 'Halftone',
  diffusion: 'Error Diffusion',
}
const FAMILY_ORDER: Family[] = ['color', 'pixelate', 'ordered', 'halftone', 'diffusion']

interface StackRowProps {
  node: StackNode
  name: string
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onDuplicate: () => void
  onRemove: () => void
}

function StackRow({ node, name, selected, onSelect, onToggle, onDuplicate, onRemove }: StackRowProps) {
  const Icon = effectIcon(node.type)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Lift the dragged row above its siblings.
    zIndex: isDragging ? 1 : undefined,
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm ${
        selected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/50'
      } ${isDragging ? 'opacity-70 shadow-sm' : ''}`}
    >
      <button
        aria-label="Drag to reorder"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Switch
        checked={node.enabled}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label="Toggle effect"
      />
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{name}</span>
      <button
        aria-label="Duplicate"
        className="text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation()
          onDuplicate()
        }}
      >
        <Copy className="size-3.5" />
      </button>
      <button
        aria-label="Remove"
        className="text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  )
}

export function StackPanel() {
  const stack = useStore((s) => s.stack)
  const selectedId = useStore((s) => s.selectedId)
  const addNode = useStore((s) => s.addNode)
  const removeNode = useStore((s) => s.removeNode)
  const toggleNode = useStore((s) => s.toggleNode)
  const reorderNode = useStore((s) => s.reorderNode)
  const duplicateNode = useStore((s) => s.duplicateNode)
  const selectNode = useStore((s) => s.selectNode)
  const addMenuOpen = useStore((s) => s.addMenuOpen)
  const setAddMenuOpen = useStore((s) => s.setAddMenuOpen)

  const sensors = useSensors(
    // A small activation distance lets a plain click on the handle still select/act
    // without starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const move = dragEndIndices(
      stack.map((n) => n.id),
      String(active.id),
      String(over.id),
    )
    if (move) reorderNode(move.from, move.to)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Effects
        </span>
        <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="outline">
                Add <ChevronDown className="ml-1 size-3" />
              </Button>
            }
          />
          {/* The default content width tracks the trigger (a small "Add" button), which
              wraps the longer effect names onto two or three lines. Size to content instead. */}
          <DropdownMenuContent align="end" className="w-auto min-w-56">
            {FAMILY_ORDER.map((family) => {
              const items = EFFECT_LIST.filter((e) => e.family === family)
              if (items.length === 0) return null
              return (
                <DropdownMenuGroup key={family}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {FAMILY_LABEL[family]}
                  </DropdownMenuLabel>
                  {items.map((e) => {
                    const Icon = effectIcon(e.type)
                    return (
                      <DropdownMenuItem key={e.type} onClick={() => addNode(e.type)}>
                        <Icon aria-hidden className="mr-2 size-3.5 text-muted-foreground" />
                        {e.name}
                      </DropdownMenuItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                </DropdownMenuGroup>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        {stack.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No effects yet. Use “Add” to stack one.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={stack.map((n) => n.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-1 p-2">
                {stack.map((node) => {
                  const def = EFFECT_LIST.find((e) => e.type === node.type)
                  return (
                    <StackRow
                      key={node.id}
                      node={node}
                      name={def?.name ?? node.type}
                      selected={node.id === selectedId}
                      onSelect={() => selectNode(node.id)}
                      onToggle={() => toggleNode(node.id)}
                      onDuplicate={() => duplicateNode(node.id)}
                      onRemove={() => removeNode(node.id)}
                    />
                  )
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  )
}
