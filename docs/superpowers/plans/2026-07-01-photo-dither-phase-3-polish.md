# Photo Dither — Phase 3 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add undo/redo, a data-driven keyboard-shortcut system with a help overlay, collapsible side panels, and real zoom/pan (with macOS trackpad support) to the dithrrd editor.

**Architecture:** Wrap the existing vanilla Zustand store in `zundo`'s `temporal` middleware for undo/redo over the `{ stack, palettes }` document, with debounced coalescing. Add transient UI state (panel-collapse, add-menu, help-dialog open) to the same store, excluded from history via `partialize`. Keyboard shortcuts live in one declarative array that feeds both a global handler hook and the help dialog. Zoom/pan uses `react-zoom-pan-pinch` wrapping the WebGL canvas, with a pure inverse-transform helper keeping the eyedropper accurate.

**Tech Stack:** React 19, TypeScript, Vite, Zustand v5 (vanilla), `zundo`, `react-zoom-pan-pinch`, `react-resizable-panels`, shadcn/Base-UI components, Vitest + Testing Library, pnpm.

## Global Constraints

- **Package manager: pnpm** — all installs/scripts use `pnpm`.
- **Zustand v5** — any added middleware must be v5-compatible (`zundo` ≥ 2.1).
- **No file > 300 lines where possible** — split when a file grows unwieldy.
- **Run format before lint/test**; all tests must pass; no linter warnings.
- **TDD** — write the failing test first, watch it fail, implement, watch it pass, commit.
- **Commit signing is on** (SSH). Before every commit, scan the diff for secrets; never commit `.env`.
- **History document = `{ stack, palettes }` only.** `source`, `selectedId`, `eyedropper`, and all UI-open/panel state are excluded from undo history.
- **⌘ = `metaKey` on macOS, `ctrlKey` elsewhere** for every modifier shortcut.
- Work happens on branch `phase-3-polish` (already created).

---

## File Structure

- **Modify** `src/store/store.ts` — wrap initializer in `zundo` `temporal`; add UI state (`panels`, `addMenuOpen`, `helpOpen`) + actions; export `useTemporal`.
- **Create** `src/features/uiPrefs.ts` — pure localStorage load/save for panel-collapse prefs.
- **Create** `src/ui/shortcuts.ts` — the `SHORTCUTS` array (single source of truth), `matchShortcut`, focus-guard + `siblingNodeId` pure helpers, `ShortcutActions` type.
- **Create** `src/ui/useKeyboardShortcuts.ts` — global `keydown` hook dispatching to `ShortcutActions`.
- **Create** `src/ui/ShortcutsDialog.tsx` — help overlay rendered from `SHORTCUTS`.
- **Create** `src/features/viewportMath.ts` — pure `clientToSourcePixel` inverse-transform helper.
- **Modify** `src/ui/AppShell.tsx` — collapsible left/right panels driven by store, via panel refs.
- **Modify** `src/ui/StackPanel.tsx` — make the Add menu a controlled `DropdownMenu` bound to store.
- **Modify** `src/ui/Viewport.tsx` — wrap canvas in `TransformWrapper`/`TransformComponent`; expose a zoom API; rewrite eyedropper mapping via `viewportMath`.
- **Modify** `src/ui/Toolbar.tsx` — Undo/Redo buttons, zoom-% indicator + Fit button, help button.
- **Modify** `src/App.tsx` — build `ShortcutActions`, mount `useKeyboardShortcuts`, hold zoom API ref + zoom %, render `ShortcutsDialog`, clear history on new image.

---

## Task 1: Undo/redo via zundo temporal middleware

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/history.test.ts` (create)

**Interfaces:**
- Consumes: existing `createAppStore()` initializer, `AppState`.
- Produces:
  - `createAppStore()` now returns a store with a `.temporal` property: `StoreApi<TemporalState<HistorySlice>>` where `HistorySlice = Pick<AppState,'stack'|'palettes'>`. `temporal.getState()` exposes `undo()`, `redo()`, `clear()`, `pastStates`, `futureStates`.
  - `useTemporal<T>(selector: (s: TemporalState<HistorySlice>) => T): T` exported from `store.ts`.

- [ ] **Step 1: Install zundo**

Run: `pnpm add zundo`
Expected: `zundo` appears in `package.json` dependencies (version ≥ 2.1).

- [ ] **Step 2: Write the failing test**

Create `src/store/history.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAppStore } from '@/store/store'

describe('undo/redo history', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces a burst of edits to the same param into one undo step', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    vi.advanceTimersByTime(400)
    const id = s.getState().stack[0].id
    s.getState().updateParam(id, 'levels', 3)
    s.getState().updateParam(id, 'levels', 4)
    s.getState().updateParam(id, 'levels', 5)
    vi.advanceTimersByTime(400)
    expect(s.getState().stack[0].params.levels).toBe(5)
    s.temporal.getState().undo()
    // one undo returns to the value before the whole burst (default 2), not 4
    expect(s.getState().stack[0].params.levels).toBe(2)
  })

  it('partialize records only stack + palettes', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    vi.advanceTimersByTime(400)
    const past = s.temporal.getState().pastStates.at(-1)!
    expect(past).toHaveProperty('stack')
    expect(past).toHaveProperty('palettes')
    expect(past).not.toHaveProperty('selectedId')
    expect(past).not.toHaveProperty('source')
  })

  it('does not record selection-only changes', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    vi.advanceTimersByTime(400)
    const before = s.temporal.getState().pastStates.length
    s.getState().selectNode(null)
    vi.advanceTimersByTime(400)
    expect(s.temporal.getState().pastStates.length).toBe(before)
  })

  it('caps history at the configured limit', () => {
    const s = createAppStore()
    for (let i = 0; i < 130; i++) {
      s.getState().addNode('bayer')
      vi.advanceTimersByTime(400)
    }
    expect(s.temporal.getState().pastStates.length).toBeLessThanOrEqual(100)
  })

  it('redo re-applies an undone change', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    vi.advanceTimersByTime(400)
    expect(s.getState().stack).toHaveLength(1)
    s.temporal.getState().undo()
    expect(s.getState().stack).toHaveLength(0)
    s.temporal.getState().redo()
    expect(s.getState().stack).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/store/history.test.ts`
Expected: FAIL — `s.temporal` is `undefined`.

- [ ] **Step 4: Wrap the store initializer in `temporal`**

In `src/store/store.ts`, add imports near the top:

```ts
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
```

Define the history slice type just above `createAppStore` (after the `AppState` interface):

```ts
type HistorySlice = Pick<AppState, 'stack' | 'palettes'>
```

Change the `createAppStore` signature from:

```ts
export function createAppStore() {
  return createStore<AppState>((set, get) => ({
    // ...existing initializer body...
  }))
}
```

to (keep the entire existing initializer body identical — only the wrapper changes):

```ts
export function createAppStore() {
  return createStore<AppState>()(
    temporal(
      (set, get) => ({
        // ...existing initializer body UNCHANGED...
      }),
      {
        partialize: (s): HistorySlice => ({ stack: s.stack, palettes: s.palettes }),
        limit: 100,
        // Skip recording when neither stack nor palettes changed (e.g. selection,
        // eyedropper, panel toggles). References are always fresh on real edits.
        equality: (a, b) => a.stack === b.stack && a.palettes === b.palettes,
        // Coalesce a burst of rapid edits (slider drag, hex typing) into ONE undo
        // step: capture the state before the burst began, then commit once the
        // edits go idle for 400ms.
        handleSet: (handleSet) => {
          let timer: ReturnType<typeof setTimeout> | undefined
          let firstPrev: HistorySlice | undefined
          return (pastState) => {
            firstPrev ??= pastState as HistorySlice
            clearTimeout(timer)
            timer = setTimeout(() => {
              if (firstPrev) handleSet(firstPrev)
              firstPrev = undefined
              timer = undefined
            }, 400)
          }
        },
      },
    ),
  )
}
```

- [ ] **Step 5: Export the `useTemporal` hook**

In `src/store/store.ts`, replace the final `useStore` export line with both hooks:

```ts
export const useStore = <T>(selector: (s: AppState) => T): T => useZustand(appStore, selector)
export const useTemporal = <T>(selector: (s: TemporalState<HistorySlice>) => T): T =>
  useZustand(appStore.temporal, selector)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- src/store/history.test.ts src/store/store.test.ts`
Expected: PASS (existing store tests still green; new history tests green).

- [ ] **Step 7: Format, typecheck, commit**

```bash
pnpm exec prettier --write src/store/store.ts src/store/history.test.ts
pnpm build
git add package.json pnpm-lock.yaml src/store/store.ts src/store/history.test.ts
git commit -m "feat(store): undo/redo history via zundo with coalescing"
```

---

## Task 2: UI state — panel collapse, add-menu, help-dialog

**Files:**
- Create: `src/features/uiPrefs.ts`
- Test: `src/features/uiPrefs.test.ts`
- Modify: `src/store/store.ts`
- Test: `src/store/store.test.ts` (append cases)

**Interfaces:**
- Produces:
  - `uiPrefs.ts`: `interface PanelPrefs { left: boolean; right: boolean }`; `loadPanelPrefs(): PanelPrefs`; `savePanelPrefs(p: PanelPrefs): void`; `PANEL_PREFS_KEY = 'dithrrd.panels.v1'`.
  - `store.ts` new `AppState` members: `panels: PanelPrefs`, `addMenuOpen: boolean`, `helpOpen: boolean`, `togglePanel(side: 'left' | 'right'): void`, `setPanelCollapsed(side: 'left' | 'right', collapsed: boolean): void`, `setAddMenuOpen(v: boolean): void`, `setHelpOpen(v: boolean): void`.

- [ ] **Step 1: Write the failing test for uiPrefs**

Create `src/features/uiPrefs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadPanelPrefs, savePanelPrefs } from '@/features/uiPrefs'

describe('panel prefs', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to both panels expanded', () => {
    expect(loadPanelPrefs()).toEqual({ left: false, right: false })
  })

  it('round-trips saved prefs', () => {
    savePanelPrefs({ left: true, right: false })
    expect(loadPanelPrefs()).toEqual({ left: true, right: false })
  })

  it('ignores malformed stored data', () => {
    localStorage.setItem('dithrrd.panels.v1', '{not json')
    expect(loadPanelPrefs()).toEqual({ left: false, right: false })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/features/uiPrefs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement uiPrefs**

Create `src/features/uiPrefs.ts`:

```ts
export const PANEL_PREFS_KEY = 'dithrrd.panels.v1'

export interface PanelPrefs {
  left: boolean
  right: boolean
}

const DEFAULT: PanelPrefs = { left: false, right: false }

export function loadPanelPrefs(): PanelPrefs {
  try {
    const raw = localStorage.getItem(PANEL_PREFS_KEY)
    if (!raw) return { ...DEFAULT }
    const p = JSON.parse(raw)
    if (typeof p?.left === 'boolean' && typeof p?.right === 'boolean') {
      return { left: p.left, right: p.right }
    }
    return { ...DEFAULT }
  } catch {
    return { ...DEFAULT }
  }
}

export function savePanelPrefs(prefs: PanelPrefs): void {
  try {
    localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable — non-fatal, prefs just won't persist
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/features/uiPrefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Add UI state + actions to the store**

In `src/store/store.ts`, add the import:

```ts
import { loadPanelPrefs, savePanelPrefs, type PanelPrefs } from '@/features/uiPrefs'
```

Add to the `AppState` interface:

```ts
  panels: PanelPrefs
  addMenuOpen: boolean
  helpOpen: boolean
  togglePanel: (side: 'left' | 'right') => void
  setPanelCollapsed: (side: 'left' | 'right', collapsed: boolean) => void
  setAddMenuOpen: (v: boolean) => void
  setHelpOpen: (v: boolean) => void
```

In the initializer, add the initial values (near `eyedropper: null`):

```ts
    panels: loadPanelPrefs(),
    addMenuOpen: false,
    helpOpen: false,
```

Add the actions (place after `selectNode`):

```ts
    togglePanel: (side) =>
      set((s) => ({ panels: { ...s.panels, [side]: !s.panels[side] } })),
    setPanelCollapsed: (side, collapsed) =>
      set((s) => ({ panels: { ...s.panels, [side]: collapsed } })),
    setAddMenuOpen: (v) => set({ addMenuOpen: v }),
    setHelpOpen: (v) => set({ helpOpen: v }),
```

- [ ] **Step 6: Persist panel prefs on the singleton**

In `src/store/store.ts`, next to the existing palette-persistence subscription, add:

```ts
let lastPanels = appStore.getState().panels
appStore.subscribe((s) => {
  if (s.panels === lastPanels) return
  lastPanels = s.panels
  savePanelPrefs(s.panels)
})
```

- [ ] **Step 7: Append store tests**

Add to `src/store/store.test.ts`:

```ts
  it('toggles panel collapse state', () => {
    const s = createAppStore()
    expect(s.getState().panels.left).toBe(false)
    s.getState().togglePanel('left')
    expect(s.getState().panels.left).toBe(true)
    s.getState().togglePanel('left')
    expect(s.getState().panels.left).toBe(false)
  })

  it('opens and closes the add menu and help dialog', () => {
    const s = createAppStore()
    s.getState().setAddMenuOpen(true)
    expect(s.getState().addMenuOpen).toBe(true)
    s.getState().setHelpOpen(true)
    expect(s.getState().helpOpen).toBe(true)
  })
```

- [ ] **Step 8: Run tests, format, commit**

Run: `pnpm test -- src/features/uiPrefs.test.ts src/store/store.test.ts`
Expected: PASS.

```bash
pnpm exec prettier --write src/features/uiPrefs.ts src/features/uiPrefs.test.ts src/store/store.ts src/store/store.test.ts
git add src/features/uiPrefs.ts src/features/uiPrefs.test.ts src/store/store.ts src/store/store.test.ts
git commit -m "feat(store): panel-collapse, add-menu, help-dialog UI state"
```

---

## Task 3: Toolbar Undo/Redo buttons

**Files:**
- Modify: `src/ui/Toolbar.tsx`
- Test: `src/ui/Toolbar.test.tsx` (create)

**Interfaces:**
- Consumes: `useTemporal` from `store.ts` (`pastStates`, `futureStates`), `appStore.temporal.getState().undo/redo`.
- Produces: Toolbar renders buttons with accessible names `Undo` / `Redo`, `disabled` when the respective history stack is empty.

- [ ] **Step 1: Write the failing test**

Create `src/ui/Toolbar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toolbar } from '@/ui/Toolbar'
import { appStore } from '@/store/store'

function reset() {
  const st = appStore.getState()
  for (const n of [...st.stack]) st.removeNode(n.id)
  appStore.temporal.getState().clear()
}

const noop = () => {}

describe('Toolbar undo/redo', () => {
  beforeEach(reset)

  it('disables undo and redo with empty history', () => {
    render(<Toolbar onUpload={noop} onReset={noop} onExport={noop} canExport={false} />)
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled()
  })

  it('enables undo after an edit and undoes on click', async () => {
    const user = userEvent.setup()
    render(<Toolbar onUpload={noop} onReset={noop} onExport={noop} canExport={false} />)
    appStore.getState().addNode('bayer')
    // handleSet debounce commits after 400ms; flush by pushing state directly
    appStore.temporal.getState().pastStates.length === 0 &&
      appStore.temporal.setState({
        pastStates: [{ stack: [], palettes: appStore.getState().palettes }],
      } as never)
    const undo = await screen.findByRole('button', { name: /undo/i })
    expect(undo).toBeEnabled()
    await user.click(undo)
    expect(appStore.getState().stack).toHaveLength(0)
  })
})
```

> Note: the second test seeds `pastStates` directly to avoid fake-timer coupling in a component test. The real debounce is covered by Task 1.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/ui/Toolbar.test.tsx`
Expected: FAIL — no Undo/Redo buttons.

- [ ] **Step 3: Add Undo/Redo to the Toolbar**

In `src/ui/Toolbar.tsx`, add imports:

```tsx
import { Undo2, Redo2 } from 'lucide-react'
import { useTemporal, appStore } from '@/store/store'
```

Inside `Toolbar`, before `return`, read history depth:

```tsx
  const canUndo = useTemporal((t) => t.pastStates.length > 0)
  const canRedo = useTemporal((t) => t.futureStates.length > 0)
```

In the right-hand button group, before the `<PresetMenu />`, insert:

```tsx
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={() => appStore.temporal.getState().undo()}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={() => appStore.temporal.getState().redo()}
        >
          <Redo2 className="size-4" />
        </Button>
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/ui/Toolbar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Format, commit**

```bash
pnpm exec prettier --write src/ui/Toolbar.tsx src/ui/Toolbar.test.tsx
git add src/ui/Toolbar.tsx src/ui/Toolbar.test.tsx
git commit -m "feat(toolbar): undo/redo buttons wired to temporal store"
```

---

## Task 4: Collapsible side panels

**Files:**
- Modify: `src/ui/AppShell.tsx`
- Test: `src/ui/AppShell.test.tsx` (append)

**Interfaces:**
- Consumes: `useStore` `panels`, `setPanelCollapsed`, `togglePanel`.
- Produces: left (`stack`) and right (`controls`) `ResizablePanel`s are `collapsible`; they collapse/expand to follow `panels.left` / `panels.right`; collapsing via drag reports back through `setPanelCollapsed`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/AppShell.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react'
import { AppShell } from '@/ui/AppShell'
import { appStore } from '@/store/store'

it('collapses the left panel when panels.left is set', () => {
  act(() => appStore.getState().setPanelCollapsed('left', false))
  render(
    <AppShell
      toolbar={<div>tb</div>}
      stack={<div>stack-content</div>}
      viewport={<div>vp</div>}
      controls={<div>controls-content</div>}
    />,
  )
  const region = screen.getByTestId('stack-region')
  expect(region).toBeInTheDocument()
  act(() => appStore.getState().setPanelCollapsed('left', true))
  // collapsed panel has zero flex size via the library; assert the data attr flips
  expect(region.closest('[data-panel]')).toHaveAttribute('data-panel-size', '0.0')
})
```

> If the exact `data-panel-size` string differs across `react-resizable-panels` versions, assert `data-panel-collapsed` presence instead; confirm the real attribute in a quick manual check while implementing.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/ui/AppShell.test.tsx`
Expected: FAIL — panels are not collapsible / don't react to store.

- [ ] **Step 3: Make the side panels collapsible and store-driven**

Rewrite `src/ui/AppShell.tsx`'s `AppShell` to use imperative panel refs synced to the store. Replace the current `AppShell` function with:

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { type ImperativePanelHandle } from 'react-resizable-panels'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { useStore } from '@/store/store'

// ...hasWebGL2() stays unchanged above...

export function AppShell({ toolbar, stack, viewport, controls }: AppShellProps) {
  const panels = useStore((s) => s.panels)
  const setPanelCollapsed = useStore((s) => s.setPanelCollapsed)
  const leftRef = useRef<ImperativePanelHandle>(null)
  const rightRef = useRef<ImperativePanelHandle>(null)

  // Drive the panels imperatively from store state.
  useEffect(() => {
    const l = leftRef.current
    if (l) panels.left ? l.collapse() : l.expand()
  }, [panels.left])
  useEffect(() => {
    const r = rightRef.current
    if (r) panels.right ? r.collapse() : r.expand()
  }, [panels.right])

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel
          ref={leftRef}
          collapsible
          collapsedSize={0}
          defaultSize={panels.left ? 0 : 20}
          minSize={14}
          onCollapse={() => setPanelCollapsed('left', true)}
          onExpand={() => setPanelCollapsed('left', false)}
        >
          <div data-testid="stack-region" className="h-full overflow-hidden border-r">
            {stack}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={56}>
          <div data-testid="viewport-region" className="h-full overflow-hidden">
            {viewport}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          ref={rightRef}
          collapsible
          collapsedSize={0}
          defaultSize={panels.right ? 0 : 24}
          minSize={16}
          onCollapse={() => setPanelCollapsed('right', true)}
          onExpand={() => setPanelCollapsed('right', false)}
        >
          <div data-testid="controls-region" className="h-full overflow-hidden border-l">
            {controls}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
```

Keep `AppShellProps`, `hasWebGL2`, and `WebGL2Fallback` unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/ui/AppShell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Format, commit**

```bash
pnpm exec prettier --write src/ui/AppShell.tsx src/ui/AppShell.test.tsx
git add src/ui/AppShell.tsx src/ui/AppShell.test.tsx
git commit -m "feat(shell): collapsible side panels driven by store"
```

---

## Task 5: Controlled Add menu in StackPanel

**Files:**
- Modify: `src/ui/StackPanel.tsx`
- Test: `src/ui/StackPanel.test.tsx` (append)

**Interfaces:**
- Consumes: `useStore` `addMenuOpen`, `setAddMenuOpen`.
- Produces: the Add `DropdownMenu` is controlled — opens when `addMenuOpen` is `true`.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/StackPanel.test.tsx` (match the file's existing imports/reset helper style):

```tsx
it('opens the add menu when store.addMenuOpen becomes true', async () => {
  render(<StackPanel />)
  act(() => appStore.getState().setAddMenuOpen(true))
  expect(await screen.findByRole('menuitem', { name: /bayer/i })).toBeInTheDocument()
})
```

Ensure `act` and `appStore` are imported in the test file (add if missing):

```tsx
import { act } from '@testing-library/react'
import { appStore } from '@/store/store'
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/ui/StackPanel.test.tsx`
Expected: FAIL — menu does not open from store state.

- [ ] **Step 3: Make the DropdownMenu controlled**

In `src/ui/StackPanel.tsx`, add store reads inside `StackPanel` (near the other `useStore` calls):

```tsx
  const addMenuOpen = useStore((s) => s.addMenuOpen)
  const setAddMenuOpen = useStore((s) => s.setAddMenuOpen)
```

Change the Add `DropdownMenu` opening tag from `<DropdownMenu>` to:

```tsx
        <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
```

(Leave the trigger/content unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/ui/StackPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Format, commit**

```bash
pnpm exec prettier --write src/ui/StackPanel.tsx src/ui/StackPanel.test.tsx
git add src/ui/StackPanel.tsx src/ui/StackPanel.test.tsx
git commit -m "feat(stack): controlled add menu bound to store"
```

---

## Task 6: Shortcut definitions, matcher, and helpers

**Files:**
- Create: `src/ui/shortcuts.ts`
- Test: `src/ui/shortcuts.test.ts`

**Interfaces:**
- Produces:
  - `type ShortcutGroup = 'Edit' | 'Stack' | 'File' | 'View' | 'Help'`
  - `interface Combo { key: string; mod?: boolean; shift?: boolean }`
  - `interface Shortcut { id: ShortcutId; label: string; group: ShortcutGroup; display: (mac: boolean) => string; combos: Combo[] }`
  - `type ShortcutId` — union of all ids below.
  - `interface ShortcutActions` — `Record<ShortcutId, () => void>`.
  - `SHORTCUTS: Shortcut[]`
  - `interface KeyDescriptor { key: string; meta: boolean; ctrl: boolean; shift: boolean }`
  - `matchShortcut(d: KeyDescriptor, shortcuts: Shortcut[], mac: boolean): Shortcut | null`
  - `isSingleKey(s: Shortcut): boolean` — true when no combo uses `mod`.
  - `isEditableTarget(el: EventTarget | null): boolean`
  - `siblingNodeId(ids: string[], selected: string | null, dir: 1 | -1): string | null`
  - `isMac(): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/ui/shortcuts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  SHORTCUTS,
  matchShortcut,
  isSingleKey,
  siblingNodeId,
  type KeyDescriptor,
} from '@/ui/shortcuts'

const d = (p: Partial<KeyDescriptor>): KeyDescriptor => ({
  key: 'a',
  meta: false,
  ctrl: false,
  shift: false,
  ...p,
})

describe('matchShortcut', () => {
  it('matches undo with ⌘Z on mac and Ctrl+Z elsewhere', () => {
    expect(matchShortcut(d({ key: 'z', meta: true }), SHORTCUTS, true)?.id).toBe('undo')
    expect(matchShortcut(d({ key: 'z', ctrl: true }), SHORTCUTS, false)?.id).toBe('undo')
  })

  it('distinguishes redo (⌘⇧Z) from undo (⌘Z)', () => {
    expect(matchShortcut(d({ key: 'z', meta: true, shift: true }), SHORTCUTS, true)?.id).toBe('redo')
  })

  it('matches single-key shortcuts without a modifier', () => {
    expect(matchShortcut(d({ key: 'e' }), SHORTCUTS, true)?.id).toBe('toggle')
    expect(matchShortcut(d({ key: 'a' }), SHORTCUTS, true)?.id).toBe('addMenu')
    expect(matchShortcut(d({ key: 'ArrowUp' }), SHORTCUTS, true)?.id).toBe('selectPrev')
    expect(matchShortcut(d({ key: '?' , shift: true }), SHORTCUTS, true)?.id).toBe('help')
  })

  it('does not match a bare letter as its ⌘ counterpart', () => {
    expect(matchShortcut(d({ key: 'z' }), SHORTCUTS, true)).toBeNull()
  })

  it('marks mod shortcuts as not single-key', () => {
    const undo = SHORTCUTS.find((s) => s.id === 'undo')!
    const toggle = SHORTCUTS.find((s) => s.id === 'toggle')!
    expect(isSingleKey(undo)).toBe(false)
    expect(isSingleKey(toggle)).toBe(true)
  })
})

describe('siblingNodeId', () => {
  const ids = ['a', 'b', 'c']
  it('selects the next node', () => expect(siblingNodeId(ids, 'a', 1)).toBe('b'))
  it('selects the previous node', () => expect(siblingNodeId(ids, 'b', -1)).toBe('a'))
  it('clamps at the ends', () => {
    expect(siblingNodeId(ids, 'c', 1)).toBe('c')
    expect(siblingNodeId(ids, 'a', -1)).toBe('a')
  })
  it('selects the first node when nothing is selected', () => {
    expect(siblingNodeId(ids, null, 1)).toBe('a')
    expect(siblingNodeId([], null, 1)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/ui/shortcuts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement shortcuts.ts**

Create `src/ui/shortcuts.ts`:

```ts
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
  { id: 'zoomIn', label: 'Zoom in', group: 'View', display: () => '+', combos: [{ key: '+' }, { key: '=' }] },
  { id: 'zoomOut', label: 'Zoom out', group: 'View', display: () => '-', combos: [{ key: '-' }, { key: '_' }] },
  { id: 'zoomFit', label: 'Fit to viewport', group: 'View', display: () => '0', combos: [{ key: '0' }] },
  { id: 'zoomReset', label: 'Zoom 100%', group: 'View', display: () => '1', combos: [{ key: '1' }] },
  { id: 'help', label: 'Keyboard shortcuts', group: 'Help', display: () => '?', combos: [{ key: '?' }] },
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/ui/shortcuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Format, commit**

```bash
pnpm exec prettier --write src/ui/shortcuts.ts src/ui/shortcuts.test.ts
git add src/ui/shortcuts.ts src/ui/shortcuts.test.ts
git commit -m "feat(shortcuts): declarative shortcut map, matcher, and helpers"
```

---

## Task 7: Global keyboard-shortcut hook

**Files:**
- Create: `src/ui/useKeyboardShortcuts.ts`
- Test: `src/ui/useKeyboardShortcuts.test.tsx`

**Interfaces:**
- Consumes: `SHORTCUTS`, `matchShortcut`, `isSingleKey`, `isEditableTarget`, `isMac`, `ShortcutActions`.
- Produces: `useKeyboardShortcuts(actions: ShortcutActions, enabled?: boolean): void` — attaches a `window` `keydown` listener; on a matched shortcut it calls `actions[id]()` and `preventDefault()`; single-key shortcuts are ignored while an editable element is focused.

- [ ] **Step 1: Write the failing test**

Create `src/ui/useKeyboardShortcuts.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useKeyboardShortcuts } from '@/ui/useKeyboardShortcuts'
import type { ShortcutActions } from '@/ui/shortcuts'

function makeActions(): ShortcutActions {
  const ids = [
    'undo','redo','delete','duplicate','toggle','selectPrev','selectNext',
    'addMenu','export','collapseLeft','collapseRight','zoomIn','zoomOut',
    'zoomFit','zoomReset','help',
  ] as const
  return Object.fromEntries(ids.map((id) => [id, vi.fn()])) as ShortcutActions
}

function Harness({ actions }: { actions: ShortcutActions }) {
  useKeyboardShortcuts(actions)
  return <input data-testid="field" />
}

describe('useKeyboardShortcuts', () => {
  it('dispatches a mod shortcut', () => {
    const actions = makeActions()
    render(<Harness actions={actions} />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    expect((actions.undo as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
  })

  it('ignores a single-key shortcut while typing in an input', () => {
    const actions = makeActions()
    const { getByTestId } = render(<Harness actions={actions} />)
    const field = getByTestId('field')
    field.focus()
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    expect((actions.toggle as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('still fires mod shortcuts while typing in an input', () => {
    const actions = makeActions()
    const { getByTestId } = render(<Harness actions={actions} />)
    const field = getByTestId('field')
    field.focus()
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, ctrlKey: true, bubbles: true }))
    expect((actions.undo as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/ui/useKeyboardShortcuts.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `src/ui/useKeyboardShortcuts.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/ui/useKeyboardShortcuts.test.tsx`
Expected: PASS.

- [ ] **Step 5: Format, commit**

```bash
pnpm exec prettier --write src/ui/useKeyboardShortcuts.ts src/ui/useKeyboardShortcuts.test.tsx
git add src/ui/useKeyboardShortcuts.ts src/ui/useKeyboardShortcuts.test.tsx
git commit -m "feat(shortcuts): global keydown dispatch hook with focus guard"
```

---

## Task 8: Shortcuts help overlay

**Files:**
- Create: `src/ui/ShortcutsDialog.tsx`
- Test: `src/ui/ShortcutsDialog.test.tsx`

**Interfaces:**
- Consumes: `useStore` `helpOpen`, `setHelpOpen`; `SHORTCUTS`, `isMac`; `Dialog` from `@/components/ui/dialog`.
- Produces: `<ShortcutsDialog />` — a modal listing every shortcut grouped by `group`, open state bound to the store.

- [ ] **Step 1: Write the failing test**

Create `src/ui/ShortcutsDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ShortcutsDialog } from '@/ui/ShortcutsDialog'
import { appStore } from '@/store/store'

describe('ShortcutsDialog', () => {
  beforeEach(() => act(() => appStore.getState().setHelpOpen(false)))

  it('is hidden until helpOpen is set', () => {
    render(<ShortcutsDialog />)
    expect(screen.queryByText(/keyboard shortcuts/i)).not.toBeInTheDocument()
  })

  it('lists shortcut groups when open', async () => {
    render(<ShortcutsDialog />)
    act(() => appStore.getState().setHelpOpen(true))
    expect(await screen.findByText('Undo')).toBeInTheDocument()
    expect(screen.getByText('Zoom in')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/ui/ShortcutsDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ShortcutsDialog**

Check `src/components/ui/dialog.tsx` for the exported members (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`). Create `src/ui/ShortcutsDialog.tsx`:

```tsx
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
```

> If `dialog.tsx` does not already exist as a shadcn/Base-UI wrapper, add it with `pnpm dlx shadcn@latest add dialog` first, then adapt imports to match the other `@/components/ui/*` files.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/ui/ShortcutsDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Format, commit**

```bash
pnpm exec prettier --write src/ui/ShortcutsDialog.tsx src/ui/ShortcutsDialog.test.tsx
git add src/ui/ShortcutsDialog.tsx src/ui/ShortcutsDialog.test.tsx
git commit -m "feat(shortcuts): help overlay rendered from the shortcut map"
```

---

## Task 9: Viewport inverse-transform math

**Files:**
- Create: `src/features/viewportMath.ts`
- Test: `src/features/viewportMath.test.ts`

**Interfaces:**
- Produces: `clientToSourcePixel(args): { x: number; y: number } | null` where `args = { clientX, clientY, rectLeft, rectTop, positionX, positionY, scale, width, height }`. Returns the source pixel under a client point given the active pan (`positionX/Y`) and `scale`, or `null` when outside the image.

- [ ] **Step 1: Write the failing test**

Create `src/features/viewportMath.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clientToSourcePixel } from '@/features/viewportMath'

describe('clientToSourcePixel', () => {
  const base = { rectLeft: 0, rectTop: 0, width: 100, height: 100 }

  it('maps identity transform 1:1', () => {
    expect(
      clientToSourcePixel({ ...base, clientX: 10, clientY: 20, positionX: 0, positionY: 0, scale: 1 }),
    ).toEqual({ x: 10, y: 20 })
  })

  it('accounts for scale', () => {
    expect(
      clientToSourcePixel({ ...base, clientX: 40, clientY: 40, positionX: 0, positionY: 0, scale: 2 }),
    ).toEqual({ x: 20, y: 20 })
  })

  it('accounts for pan translation', () => {
    expect(
      clientToSourcePixel({ ...base, clientX: 30, clientY: 30, positionX: 10, positionY: 5, scale: 1 }),
    ).toEqual({ x: 20, y: 25 })
  })

  it('returns null outside the image', () => {
    expect(
      clientToSourcePixel({ ...base, clientX: -5, clientY: 10, positionX: 0, positionY: 0, scale: 1 }),
    ).toBeNull()
    expect(
      clientToSourcePixel({ ...base, clientX: 500, clientY: 10, positionX: 0, positionY: 0, scale: 1 }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/features/viewportMath.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement viewportMath**

Create `src/features/viewportMath.ts`:

```ts
export interface ClientToSourceArgs {
  clientX: number
  clientY: number
  rectLeft: number
  rectTop: number
  positionX: number
  positionY: number
  scale: number
  width: number
  height: number
}

// react-zoom-pan-pinch applies translate(positionX, positionY) scale(scale) to the
// content (the canvas at its natural pixel size, which equals the source size). Invert
// that transform to recover the source pixel under a client point.
export function clientToSourcePixel(a: ClientToSourceArgs): { x: number; y: number } | null {
  const x = Math.floor((a.clientX - a.rectLeft - a.positionX) / a.scale)
  const y = Math.floor((a.clientY - a.rectTop - a.positionY) / a.scale)
  if (x < 0 || y < 0 || x >= a.width || y >= a.height) return null
  return { x, y }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/features/viewportMath.test.ts`
Expected: PASS.

- [ ] **Step 5: Format, commit**

```bash
pnpm exec prettier --write src/features/viewportMath.ts src/features/viewportMath.test.ts
git add src/features/viewportMath.ts src/features/viewportMath.test.ts
git commit -m "feat(viewport): pure inverse-transform helper for eyedropper"
```

---

## Task 10: Zoom/pan in the Viewport

**Files:**
- Modify: `src/ui/Viewport.tsx`
- Test: manual (library-driven gestures aren't unit-tested; the eyedropper math is covered by Task 9).

**Interfaces:**
- Consumes: `react-zoom-pan-pinch` (`TransformWrapper`, `TransformComponent`, `ReactZoomPanPinchRef`); `clientToSourcePixel`.
- Produces: `ViewportProps` gains `zoomApiRef?: MutableRefObject<ZoomApi | null>` and `onZoomChange?: (scale: number) => void`, where `interface ZoomApi { in(): void; out(): void; fit(): void; reset(): void }`. The canvas is wrapped in the transform; the eyedropper uses the live transform state.

- [ ] **Step 1: Install the library**

Run: `pnpm add react-zoom-pan-pinch`
Expected: `react-zoom-pan-pinch` in `package.json` dependencies.

- [ ] **Step 2: Add the ZoomApi type and props**

In `src/ui/Viewport.tsx`, add imports:

```tsx
import { useRef, type MutableRefObject } from 'react' // merge with existing react import
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch'
import { clientToSourcePixel } from '@/features/viewportMath'
```

Extend the props interface:

```tsx
export interface ZoomApi {
  in: () => void
  out: () => void
  fit: () => void
  reset: () => void
}

interface ViewportProps {
  onReady?: (api: { backend: Backend; runCpu: RunCpu } | null) => void
  zoomApiRef?: MutableRefObject<ZoomApi | null>
  onZoomChange?: (scale: number) => void
}
```

- [ ] **Step 3: Add refs and the zoom API wiring**

Inside `Viewport`, add near the other refs:

```tsx
  const zoomRef = useRef<ReactZoomPanPinchRef | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
```

Add an effect that publishes the zoom API (place after the existing effects):

```tsx
  useEffect(() => {
    const ref = props.zoomApiRef
    if (!ref) return
    const fitScale = () => {
      const canvas = canvasRef.current
      const box = containerRef.current
      if (!canvas || !box) return 1
      return Math.min(box.clientWidth / canvas.width, box.clientHeight / canvas.height)
    }
    ref.current = {
      in: () => zoomRef.current?.zoomIn(),
      out: () => zoomRef.current?.zoomOut(),
      fit: () => zoomRef.current?.centerView(fitScale()),
      reset: () => zoomRef.current?.centerView(1),
    }
    return () => {
      ref.current = null
    }
  }, [props.zoomApiRef])
```

> Change the component signature to `export function Viewport(props: ViewportProps)` and read `props.onReady`, `props.zoomApiRef`, `props.onZoomChange` (or destructure with those names) so the effect above can reference `props.zoomApiRef`.

- [ ] **Step 4: Rewrite the eyedropper click handler**

Replace `onCanvasClick` with a version that inverts the live transform:

```tsx
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropper || !source) return
    const instance = zoomRef.current?.instance
    const wrapper = instance?.wrapperComponent
    const t = instance?.transformState
    if (!wrapper || !t) return
    const rect = wrapper.getBoundingClientRect()
    const px = clientToSourcePixel({
      clientX: e.clientX,
      clientY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      positionX: t.positionX,
      positionY: t.positionY,
      scale: t.scale,
      width: source.width,
      height: source.height,
    })
    if (!px) return
    const i = (px.y * source.width + px.x) * 4
    const d = source.image.data
    applyEyedropper([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255])
  }
```

- [ ] **Step 5: Wrap the canvas in the transform**

Replace the returned JSX (the `<div>` with the checkerboard and `<canvas>`) with:

```tsx
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundImage: 'repeating-conic-gradient(#00000010 0% 25%, transparent 0% 50%)',
        backgroundSize: '20px 20px',
      }}
    >
      <TransformWrapper
        ref={zoomRef}
        minScale={0.1}
        maxScale={40}
        limitToBounds={false}
        centerOnInit
        doubleClick={{ mode: 'reset' }}
        wheel={{ step: 0.15 }}
        panning={{ velocityDisabled: true }}
        onTransformed={(_, state) => props.onZoomChange?.(state.scale)}
      >
        <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-full !w-full items-center justify-center">
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="max-h-full max-w-full object-contain shadow-sm"
            style={{ cursor: eyedropper ? 'crosshair' : undefined }}
          />
        </TransformComponent>
      </TransformWrapper>
      <ProcessingOverlay show={rendering} />
    </div>
  )
```

- [ ] **Step 6: Verify the app builds and existing tests pass**

Run: `pnpm build && pnpm test`
Expected: build succeeds; all existing tests pass.

- [ ] **Step 7: Manual smoke check**

Run: `pnpm dev`, open an image, and verify: trackpad pinch zooms toward the cursor; two-finger scroll pans; ⌘/Ctrl + wheel zooms; double-click resets; the eyedropper still samples the correct pixel while zoomed/panned.

- [ ] **Step 8: Format, commit**

```bash
pnpm exec prettier --write src/ui/Viewport.tsx
git add package.json pnpm-lock.yaml src/ui/Viewport.tsx
git commit -m "feat(viewport): zoom/pan via react-zoom-pan-pinch with trackpad support"
```

---

## Task 11: Toolbar zoom controls + help button

**Files:**
- Modify: `src/ui/Toolbar.tsx`
- Test: `src/ui/Toolbar.test.tsx` (append)

**Interfaces:**
- Consumes: new `ToolbarProps` — `zoomPct: number`, `onZoomFit: () => void`, `onShowHelp: () => void`.
- Produces: a zoom-% label, a `Fit` button (calls `onZoomFit`), and a help button with accessible name `Keyboard shortcuts` (calls `onShowHelp`).

- [ ] **Step 1: Write the failing test**

Append to `src/ui/Toolbar.test.tsx`:

```tsx
import { vi } from 'vitest'

it('shows zoom percent and triggers fit + help', async () => {
  const user = userEvent.setup()
  const onZoomFit = vi.fn()
  const onShowHelp = vi.fn()
  render(
    <Toolbar
      onUpload={noop}
      onReset={noop}
      onExport={noop}
      canExport={false}
      zoomPct={150}
      onZoomFit={onZoomFit}
      onShowHelp={onShowHelp}
    />,
  )
  expect(screen.getByText('150%')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /fit/i }))
  expect(onZoomFit).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: /keyboard shortcuts/i }))
  expect(onShowHelp).toHaveBeenCalled()
})
```

Update the earlier Toolbar tests' `render(...)` calls to pass the new required props (`zoomPct={100} onZoomFit={noop} onShowHelp={noop}`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/ui/Toolbar.test.tsx`
Expected: FAIL — props/elements missing.

- [ ] **Step 3: Extend the Toolbar**

In `src/ui/Toolbar.tsx`, add imports:

```tsx
import { Keyboard, Maximize } from 'lucide-react'
```

Extend `ToolbarProps`:

```tsx
interface ToolbarProps {
  onUpload: (file: File) => void
  onReset: () => void
  onExport: () => void
  canExport: boolean
  zoomPct: number
  onZoomFit: () => void
  onShowHelp: () => void
}
```

Update the destructure and add controls. Put the zoom cluster on the left side (after the `dithrrd` label span):

```tsx
        <span className="ml-2 tabular-nums text-xs text-muted-foreground">{zoomPct}%</span>
        <Button variant="ghost" size="sm" onClick={onZoomFit}>
          <Maximize className="mr-1 size-3.5" /> Fit
        </Button>
```

And add the help button in the right cluster (before `<PresetMenu />`):

```tsx
        <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" onClick={onShowHelp}>
          <Keyboard className="size-4" />
        </Button>
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- src/ui/Toolbar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Format, commit**

```bash
pnpm exec prettier --write src/ui/Toolbar.tsx src/ui/Toolbar.test.tsx
git add src/ui/Toolbar.tsx src/ui/Toolbar.test.tsx
git commit -m "feat(toolbar): zoom indicator, fit button, and help trigger"
```

---

## Task 12: App wiring — connect everything

**Files:**
- Modify: `src/App.tsx`
- Test: manual smoke (integration of already-tested units).

**Interfaces:**
- Consumes: `useKeyboardShortcuts`, `ShortcutActions`, `siblingNodeId`, `ShortcutsDialog`, `ZoomApi` from `Viewport`, store actions + `appStore.temporal`.
- Produces: fully wired shortcuts, zoom controls, help overlay, and history-clear on new image.

- [ ] **Step 1: Add refs, zoom state, and history clear**

In `src/App.tsx`, add imports:

```tsx
import { useRef, useEffect, useState } from 'react' // merge with existing
import { appStore } from '@/store/store'
import { useKeyboardShortcuts } from '@/ui/useKeyboardShortcuts'
import { siblingNodeId, type ShortcutActions } from '@/ui/shortcuts'
import { ShortcutsDialog } from '@/ui/ShortcutsDialog'
import { Viewport, type ZoomApi } from '@/ui/Viewport'
```

Inside `App`, add state/refs and read the store actions:

```tsx
  const [zoomPct, setZoomPct] = useState(100)
  const zoomApiRef = useRef<ZoomApi | null>(null)
  const setAddMenuOpen = useStore((s) => s.setAddMenuOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const togglePanel = useStore((s) => s.togglePanel)
```

Clear undo history when a new image loads — update `onUpload`:

```tsx
  const onUpload = async (file: File) => {
    try {
      setSource(await decodeToWorkingImage(file))
      appStore.temporal.getState().clear()
    } catch {
      toast.error('Could not open that image. Try a different file.')
    }
  }
```

And clear history after a startup preset load — at the end of the `try` block in the existing URL-preset `useEffect`, after `loadPreset(...)`, add:

```tsx
      appStore.temporal.getState().clear()
```

- [ ] **Step 2: Build the ShortcutActions and mount the hook**

Inside `App`, before `return`, construct the actions from store state (read fresh via `appStore.getState()` so handlers always see the current stack/selection):

```tsx
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
```

- [ ] **Step 3: Wire the Viewport, Toolbar, and dialog into the render**

Update the `Toolbar` element to pass zoom/help props:

```tsx
          <Toolbar
            onUpload={onUpload}
            onReset={() => location.reload()}
            onExport={onExport}
            canExport={!!source}
            zoomPct={zoomPct}
            onZoomFit={() => zoomApiRef.current?.fit()}
            onShowHelp={() => setHelpOpen(true)}
          />
```

Update the `Viewport` element:

```tsx
        viewport={
          <Viewport
            onReady={(api) => (apiRef.current = api)}
            zoomApiRef={zoomApiRef}
            onZoomChange={(scale) => setZoomPct(Math.round(scale * 100))}
          />
        }
```

Add `<ShortcutsDialog />` next to `<Toaster />` at the end of the returned fragment:

```tsx
      <ShortcutsDialog />
      <Toaster position="bottom-center" />
```

- [ ] **Step 4: Build, run full test suite**

Run: `pnpm build && pnpm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 5: Full manual smoke check**

Run: `pnpm dev` and verify end-to-end:
- ⌘Z / ⌘⇧Z undo/redo a slider drag as a single step; toolbar buttons enable/disable correctly.
- `A` opens the add menu; `E` toggles, ⌘D duplicates, Delete removes the selected node; ↑/↓ move selection.
- `[` / `]` collapse the side panels; state survives reload.
- `?` opens the help overlay; ⌘E exports.
- `+` / `-` / `0` / `1` zoom; trackpad pinch/pan work; zoom % updates; eyedropper still accurate while zoomed.
- Single-key shortcuts do nothing while typing in a hex/name field.

- [ ] **Step 6: Format, commit**

```bash
pnpm exec prettier --write src/App.tsx
git add src/App.tsx
git commit -m "feat(app): wire shortcuts, zoom controls, help overlay, history reset"
```

---

## Self-Review

**Spec coverage:**
- Undo/redo (document = stack+palettes, coalesce, limit, clear on image) → Task 1 (+ Task 12 clear).
- Keyboard shortcuts (map, focus guard, single source of truth) → Tasks 6, 7, 12.
- Collapsible side panels (persisted, not in history) → Tasks 2, 4.
- Help overlay (from same array) → Task 8.
- Zoom/pan (react-zoom-pan-pinch, trackpad, keyboard, toolbar indicator, eyedropper fix) → Tasks 9, 10, 11, 12.

**Type consistency:** `ShortcutId`/`ShortcutActions` keys match the `actions` object in Task 12; `ZoomApi` (`in/out/fit/reset`) is defined in Task 10 and consumed in Tasks 11–12; `HistorySlice`/`useTemporal` defined in Task 1 and used in Task 3; `PanelPrefs` defined in Task 2 and used in Tasks 2/4.

**Placeholder scan:** no TBD/TODO; every code step carries full code. Two attribute/version caveats (Task 4 `data-panel-size`, Task 8 dialog scaffold) are called out with a concrete fallback rather than left vague.

**Open risk:** the exact `zundo` `handleSet(pastState)` argument semantics — the Task 1 tests pin the intended behavior, so TDD surfaces any mismatch immediately.
```
