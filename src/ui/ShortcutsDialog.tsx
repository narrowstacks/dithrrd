import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useStore } from '@/store/store'
import { SHORTCUTS, isMac, type ShortcutGroup } from '@/ui/shortcuts'

const GROUP_ORDER: ShortcutGroup[] = ['Edit', 'Stack', 'View', 'File', 'Help']

export function ShortcutsDialog() {
  const open = useStore((s) => s.helpOpen)
  const setOpen = useStore((s) => s.setHelpOpen)
  const mac = isMac()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {GROUP_ORDER.map((group) => {
            const items = SHORTCUTS.filter((s) => s.group === group)
            if (items.length === 0) return null
            return (
              <div key={group}>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </div>
                <ul className="flex flex-col gap-1">
                  {items.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span>{s.label}</span>
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">
                        {s.display(mac)}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
