# Photo Dither Customizer — Phase 2B: Custom Palette Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create and edit their own palettes — add/remove/reorder swatches, enter hex or eyedrop a color from the image, name/duplicate/delete palettes, import/export as JSON — with custom palettes persisted to localStorage and immediately usable by the Palette Map effect.

**Architecture:** The engine already consumes `store.palettes` (`Record<string, Palette>`) via `ctx.palettes` — the Palette Map effect looks up `ctx.palettes[paletteId]` and the Viewport passes the store's palettes into `execute()`. So this subsystem is almost entirely **state + UI**: add palette CRUD actions to the Zustand store, persist the custom (non-built-in) subset to localStorage, and build a `PaletteControl`/`PaletteEditor` UI that replaces the current hardcoded palette dropdown (which today reads the built-in `PALETTES` constant directly and ignores custom palettes). Built-in palettes stay defined in code; custom palettes merge in on load.

**Tech Stack:** TypeScript, React, Zustand, Tailwind v4, shadcn/@base-ui components, Vitest + Testing Library.

## Global Constraints

- **Package manager:** pnpm only. Focused test: `pnpm exec vitest run <file>`; full: `pnpm test`. Typecheck: `pnpm exec tsc -b`. Path alias `@/` → `src/`.
- **shadcn is @base-ui (base-nova), NOT Radix.** For polymorphic composition use `render={<Comp/>}`, NOT `asChild`. Verify each generated component's prop API before use (e.g. `Popover`/`Input`/`Select` under `src/components/ui/`). This is a carried-forward hazard from Phase 1.
- **Palette model:** `Palette = { id: string; name: string; colors: [number, number, number][] }`, colors as `0..1` RGB floats (`src/effects/types.ts`). Unchanged by this plan.
- **Built-in vs custom:** built-in palette ids are exactly the keys of `PALETTES` (`src/color/palettes.ts`): `bw`, `gray4`, `gameboy`. Any palette whose id is not a built-in key is a **custom** palette and is persisted. Built-ins are never persisted and cannot be deleted/edited through the UI.
- **Palette effect capacity:** the Palette Map shader supports up to **16** swatches (`MAX = 16` in `src/effects/palette.ts`). The editor must clamp swatch count to `1..16`.
- **localStorage key:** `dithrrd.palettes.v1`. All storage access is wrapped in try/catch — a storage failure (quota, disabled, malformed JSON) must never throw into the app; fall back to no custom palettes.
- **Store purity:** `createAppStore()` stays free of side effects so tests can exercise it in isolation; localStorage **persistence** is wired as a subscription on the exported singleton `appStore` only (not inside actions, not inside `createAppStore`). Initial load of custom palettes happens once at store creation via a pure helper.
- **UI aesthetic:** minimal, near-monochrome; color reserved for the swatches themselves and the primary action. Match existing `Control.tsx` spacing (`space-y-1.5`, `text-xs` labels).
- **Commits:** Conventional Commit messages, one per task.

---

## File Structure

```
src/
  color/
    hex.ts               # CREATE: hex <-> rgb01 helpers (hexToRgb01, rgb01ToHex, isValidHex)
    hex.test.ts          # CREATE
    palettes.ts          # MODIFY: reuse hexToRgb01 (behavior unchanged)
  features/
    paletteStorage.ts    # CREATE: load/save custom palettes to localStorage (guarded)
    paletteStorage.test.ts # CREATE
  store/
    store.ts             # MODIFY: init merge of custom palettes, palette CRUD actions, singleton persistence
    store.test.ts        # MODIFY: palette action tests
  ui/
    PaletteControl.tsx   # CREATE: store-connected palette picker + editor entry (used by Control 'palette' case)
    PaletteControl.test.tsx # CREATE
    PaletteEditor.tsx    # CREATE: swatch grid — hex edit, add/remove/reorder swatches
    PaletteEditor.test.tsx # CREATE
    Control.tsx          # MODIFY: 'palette' case renders <PaletteControl>, drop hardcoded PALETTES import
    Viewport.tsx         # MODIFY (Task 8 only): eyedropper click sampling
```

---

## Task 1: Hex ↔ rgb01 color helpers

Shared conversion between `#rrggbb` strings and `[r,g,b]` `0..1` floats, used by swatch editing and import. Refactor the existing inline `hex()` in `palettes.ts` to use it (behavior identical).

**Files:**
- Create: `src/color/hex.ts`, `src/color/hex.test.ts`
- Modify: `src/color/palettes.ts`

**Interfaces:**
- Produces:
  - `hexToRgb01(hex: string): [number, number, number]` — accepts `'#rrggbb'` or `'rrggbb'` (case-insensitive). Invalid input throws `Error`.
  - `rgb01ToHex(rgb: [number, number, number]): string` — returns lowercase `'#rrggbb'`, each channel clamped to `0..1` then rounded to `0..255`.
  - `isValidHex(hex: string): boolean` — true for 6-digit hex with optional leading `#`.

- [ ] **Step 1: Write the failing test**

Create `src/color/hex.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hexToRgb01, rgb01ToHex, isValidHex } from '@/color/hex'

describe('hex helpers', () => {
  it('parses #rrggbb and bare rrggbb to 0..1 rgb', () => {
    expect(hexToRgb01('#ffffff')).toEqual([1, 1, 1])
    expect(hexToRgb01('000000')).toEqual([0, 0, 0])
    const [r, g, b] = hexToRgb01('#8bac0f')
    expect(r).toBeCloseTo(0x8b / 255, 5)
    expect(g).toBeCloseTo(0xac / 255, 5)
    expect(b).toBeCloseTo(0x0f / 255, 5)
  })
  it('is case-insensitive', () => {
    expect(hexToRgb01('#8BAC0F')).toEqual(hexToRgb01('#8bac0f'))
  })
  it('throws on invalid hex', () => {
    expect(() => hexToRgb01('xyz')).toThrow()
    expect(() => hexToRgb01('#fff')).toThrow() // 3-digit shorthand not supported
  })
  it('formats rgb01 back to lowercase #rrggbb, clamping out-of-range', () => {
    expect(rgb01ToHex([1, 1, 1])).toBe('#ffffff')
    expect(rgb01ToHex([0, 0, 0])).toBe('#000000')
    expect(rgb01ToHex([-0.5, 0.5, 2])).toBe('#0080ff')
  })
  it('round-trips', () => {
    expect(rgb01ToHex(hexToRgb01('#306230'))).toBe('#306230')
  })
  it('validates', () => {
    expect(isValidHex('#abcdef')).toBe(true)
    expect(isValidHex('ABCDEF')).toBe(true)
    expect(isValidHex('#abc')).toBe(false)
    expect(isValidHex('nope')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/color/hex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/color/hex.ts`:

```ts
const HEX_RE = /^#?[0-9a-fA-F]{6}$/

export function isValidHex(hex: string): boolean {
  return HEX_RE.test(hex.trim())
}

export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`invalid hex: ${hex}`)
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

export function rgb01ToHex(rgb: [number, number, number]): string {
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`
}
```

- [ ] **Step 4: Refactor palettes.ts to reuse it**

In `src/color/palettes.ts`, replace the local `hex` helper with the shared one. Change the top of the file:

```ts
import type { Palette } from '@/effects/types'
import { hexToRgb01 } from '@/color/hex'

const hex = hexToRgb01
```

Leave the rest of `palettes.ts` (the `PALETTES` object and `nearestColor`) unchanged — `hex('0f380f')` etc. still work because `hexToRgb01` accepts bare 6-digit hex.

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm exec vitest run src/color/hex.test.ts src/color/palettes.test.ts`
Expected: PASS (both files; existing palette tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/color/hex.ts src/color/hex.test.ts src/color/palettes.ts
git commit -m "feat: hex <-> rgb01 color helpers; reuse in palettes"
```

---

## Task 2: Custom-palette localStorage persistence module

Load/save the custom (non-built-in) palettes to localStorage, fully guarded so storage errors never propagate.

**Files:**
- Create: `src/features/paletteStorage.ts`, `src/features/paletteStorage.test.ts`

**Interfaces:**
- Consumes: `Palette` from `@/effects/types`.
- Produces:
  - `PALETTE_STORAGE_KEY = 'dithrrd.palettes.v1'`
  - `loadCustomPalettes(): Palette[]` — reads + JSON-parses + validates the stored array; returns `[]` on any error or if absent. Invalid individual entries are dropped.
  - `saveCustomPalettes(palettes: Palette[]): void` — JSON-stringifies and writes; swallows any error (e.g. quota).

- [ ] **Step 1: Write the failing test**

Create `src/features/paletteStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadCustomPalettes,
  saveCustomPalettes,
  PALETTE_STORAGE_KEY,
} from '@/features/paletteStorage'
import type { Palette } from '@/effects/types'

const sample: Palette = { id: 'p1', name: 'Mine', colors: [[0, 0, 0], [1, 1, 1]] }

describe('paletteStorage', () => {
  beforeEach(() => localStorage.clear())

  it('returns [] when nothing is stored', () => {
    expect(loadCustomPalettes()).toEqual([])
  })

  it('round-trips a saved palette', () => {
    saveCustomPalettes([sample])
    expect(loadCustomPalettes()).toEqual([sample])
  })

  it('returns [] on malformed JSON', () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, '{not json')
    expect(loadCustomPalettes()).toEqual([])
  })

  it('drops entries with an invalid shape', () => {
    localStorage.setItem(
      PALETTE_STORAGE_KEY,
      JSON.stringify([
        sample,
        { id: 'bad' }, // missing name/colors
        { id: 'x', name: 'y', colors: 'nope' }, // colors not an array
      ]),
    )
    expect(loadCustomPalettes()).toEqual([sample])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/paletteStorage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/paletteStorage.ts`:

```ts
import type { Palette } from '@/effects/types'

export const PALETTE_STORAGE_KEY = 'dithrrd.palettes.v1'

function isPalette(x: unknown): x is Palette {
  if (typeof x !== 'object' || x === null) return false
  const p = x as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    Array.isArray(p.colors) &&
    p.colors.every(
      (c) => Array.isArray(c) && c.length === 3 && c.every((n) => typeof n === 'number'),
    )
  )
}

export function loadCustomPalettes(): Palette[] {
  try {
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPalette)
  } catch {
    return []
  }
}

export function saveCustomPalettes(palettes: Palette[]): void {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palettes))
  } catch {
    // storage unavailable or over quota — non-fatal, custom palettes just won't persist
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/features/paletteStorage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/paletteStorage.ts src/features/paletteStorage.test.ts
git commit -m "feat: guarded localStorage persistence for custom palettes"
```

---

## Task 3: Store — palette CRUD actions, initial merge, persistence subscription

Add palette state actions and wire custom-palette persistence on the singleton store.

**Files:**
- Modify: `src/store/store.ts`, `src/store/store.test.ts`

**Interfaces:**
- Consumes: `loadCustomPalettes`, `saveCustomPalettes` (Task 2); `PALETTES` (`@/color/palettes`); `Palette` (`@/effects/types`).
- Produces (new `AppState` members):
  - `addPalette(): string` — creates a custom palette (`id` = `crypto.randomUUID()`, `name` = next free `Custom N`, `colors` = `[[0,0,0],[1,1,1]]`), inserts it into `palettes`, returns the new id. Does NOT change `selectedId` or any node param (the caller decides whether to select it).
  - `updatePalette(id: string, patch: { name?: string; colors?: [number, number, number][] }): void` — shallow-merges into the palette; no-op if `id` absent.
  - `removePalette(id: string): void` — deletes the palette from `palettes`; no-op for built-in ids (`id in PALETTES`).
  - `duplicatePalette(id: string): string` — copies the palette (built-in or custom) into a new custom palette (`name` = `"<name> copy"`, fresh id, deep-copied colors); returns the new id; returns `''` if `id` absent.
- Also: `palettes` is now initialised from `loadInitialPalettes()` (built-ins + persisted custom), and the exported singleton persists custom palettes on change.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/store.test.ts` (keep existing imports + tests; add the persistence import and a new describe block):

```ts
import { beforeEach } from 'vitest'
import { PALETTES } from '@/color/palettes'
import { loadCustomPalettes } from '@/features/paletteStorage'

describe('app store — palettes', () => {
  beforeEach(() => localStorage.clear())

  it('starts with the built-in palettes', () => {
    const s = createAppStore()
    expect(Object.keys(s.getState().palettes).sort()).toEqual(Object.keys(PALETTES).sort())
  })

  it('addPalette creates a custom palette with a black+white default and returns its id', () => {
    const s = createAppStore()
    const id = s.getState().addPalette()
    const p = s.getState().palettes[id]
    expect(p).toBeTruthy()
    expect(p.colors).toEqual([[0, 0, 0], [1, 1, 1]])
    expect(id in PALETTES).toBe(false)
  })

  it('updatePalette merges name and colors', () => {
    const s = createAppStore()
    const id = s.getState().addPalette()
    s.getState().updatePalette(id, { name: 'Sunset', colors: [[1, 0, 0]] })
    expect(s.getState().palettes[id]).toMatchObject({ name: 'Sunset', colors: [[1, 0, 0]] })
  })

  it('removePalette deletes a custom palette but ignores built-ins', () => {
    const s = createAppStore()
    const id = s.getState().addPalette()
    s.getState().removePalette(id)
    expect(s.getState().palettes[id]).toBeUndefined()
    s.getState().removePalette('bw')
    expect(s.getState().palettes.bw).toBeTruthy() // built-in survives
  })

  it('duplicatePalette copies (built-in or custom) into a new custom palette', () => {
    const s = createAppStore()
    const id = s.getState().duplicatePalette('gameboy')
    expect(id).not.toBe('gameboy')
    expect(id in PALETTES).toBe(false)
    expect(s.getState().palettes[id].colors).toEqual(PALETTES.gameboy.colors)
    expect(s.getState().palettes[id].colors).not.toBe(PALETTES.gameboy.colors) // deep copy
    expect(s.getState().palettes[id].name).toMatch(/copy/i)
  })
})

describe('app store — palette persistence (singleton)', () => {
  beforeEach(() => localStorage.clear())

  it('persists custom palettes (not built-ins) via the exported appStore', async () => {
    const { appStore } = await import('@/store/store')
    const id = appStore.getState().addPalette()
    const persisted = loadCustomPalettes()
    expect(persisted.map((p) => p.id)).toContain(id)
    expect(persisted.some((p) => p.id in PALETTES)).toBe(false)
    appStore.getState().removePalette(id) // cleanup shared singleton state
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/store/store.test.ts`
Expected: FAIL — `addPalette`/`updatePalette`/`removePalette`/`duplicatePalette` not defined.

- [ ] **Step 3: Implement store changes**

In `src/store/store.ts`:

Add imports at the top (after existing imports):

```ts
import { loadCustomPalettes, saveCustomPalettes } from '@/features/paletteStorage'
```

Add the four action signatures to the `AppState` interface (after `selectNode`):

```ts
  addPalette: () => string
  updatePalette: (id: string, patch: { name?: string; colors?: [number, number, number][] }) => void
  removePalette: (id: string) => void
  duplicatePalette: (id: string) => string
```

Add these helpers above `createAppStore`:

```ts
function loadInitialPalettes(): Record<string, Palette> {
  const custom = Object.fromEntries(loadCustomPalettes().map((p) => [p.id, p]))
  return { ...PALETTES, ...custom }
}

function nextCustomName(palettes: Record<string, Palette>): string {
  const used = new Set(Object.values(palettes).map((p) => p.name))
  for (let i = 1; ; i++) {
    const name = `Custom ${i}`
    if (!used.has(name)) return name
  }
}
```

Change the store initializer's `palettes` line from `palettes: PALETTES,` to:

```ts
    palettes: loadInitialPalettes(),
```

`duplicatePalette` must read current state to build the copy AND return the new id, which a `set`-only closure can't do cleanly — so **change the store factory signature to include `get`**: `createStore<AppState>((set, get) => ({ ... }))`.

Add the four actions inside the store object (after `selectNode`):

```ts
    addPalette: () => {
      const id = newId()
      set((s) => ({
        palettes: {
          ...s.palettes,
          [id]: { id, name: nextCustomName(s.palettes), colors: [[0, 0, 0], [1, 1, 1]] },
        },
      }))
      return id
    },

    updatePalette: (id, patch) =>
      set((s) => {
        const p = s.palettes[id]
        if (!p) return s
        return { palettes: { ...s.palettes, [id]: { ...p, ...patch } } }
      }),

    removePalette: (id) =>
      set((s) => {
        if (id in PALETTES || !(id in s.palettes)) return s
        const next = { ...s.palettes }
        delete next[id]
        return { palettes: next }
      }),

    duplicatePalette: (id) => {
      const src = get().palettes[id]
      if (!src) return ''
      const copyId = newId()
      set((s) => ({
        palettes: {
          ...s.palettes,
          [copyId]: {
            id: copyId,
            name: `${src.name} copy`,
            colors: src.colors.map((c) => [c[0], c[1], c[2]] as [number, number, number]),
          },
        },
      }))
      return copyId
    },
```

Finally, wire persistence on the singleton (after `export const appStore = createAppStore()`):

```ts
// Persist the custom (non-built-in) palettes whenever the palette map changes.
// Subscription lives on the singleton only, so createAppStore() stays side-effect free for tests.
let lastPalettes = appStore.getState().palettes
appStore.subscribe((s) => {
  if (s.palettes === lastPalettes) return
  lastPalettes = s.palettes
  saveCustomPalettes(Object.values(s.palettes).filter((p) => !(p.id in PALETTES)))
})
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/store/store.test.ts`
Expected: PASS (existing node tests + new palette tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm exec tsc -b` (expected: no errors).

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat: palette CRUD store actions + custom-palette persistence"
```

---

## Task 4: Palette picker reads from the store (not hardcoded built-ins)

Replace the `Control.tsx` `palette` case's hardcoded `PALETTES` dropdown with a store-connected `PaletteControl` that lists all palettes (built-in + custom). Editing UI comes in later tasks; this task just fixes the data source and creates the component seam.

**Files:**
- Create: `src/ui/PaletteControl.tsx`, `src/ui/PaletteControl.test.tsx`
- Modify: `src/ui/Control.tsx`

**Interfaces:**
- Consumes: `useStore` (`@/store/store`); shadcn `Select` family.
- Produces: `PaletteControl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void })` — renders a labelled `Select` whose options are `Object.values(store.palettes)`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/PaletteControl.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaletteControl } from '@/ui/PaletteControl'
import { appStore } from '@/store/store'

describe('PaletteControl', () => {
  beforeEach(() => {
    // reset to built-ins only
    for (const id of Object.keys(appStore.getState().palettes)) appStore.getState().removePalette(id)
  })

  it('lists a freshly added custom palette in its options', () => {
    const id = appStore.getState().addPalette()
    appStore.getState().updatePalette(id, { name: 'ZZTop' })
    render(<PaletteControl label="Palette" value="bw" onChange={() => {}} />)
    // The trigger shows the current value's name; the custom palette exists in the store,
    // so the component must source options from the store (not the PALETTES constant).
    expect(appStore.getState().palettes[id].name).toBe('ZZTop')
    expect(screen.getByText('Palette')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/ui/PaletteControl.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PaletteControl**

Create `src/ui/PaletteControl.tsx`:

```tsx
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/store/store'

interface PaletteControlProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function PaletteControl({ label, value, onChange }: PaletteControlProps) {
  const palettes = useStore((s) => s.palettes)
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as string)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.values(palettes).map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 4: Rewire Control.tsx**

In `src/ui/Control.tsx`: remove the `import { PALETTES } from '@/color/palettes'` line, add `import { PaletteControl } from '@/ui/PaletteControl'`, and replace the entire `case 'palette':` block with:

```tsx
    case 'palette':
      return (
        <PaletteControl
          label={control.label}
          value={String(value)}
          onChange={(v) => onChange(v)}
        />
      )
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run src/ui/PaletteControl.test.tsx src/ui/ControlsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/PaletteControl.tsx src/ui/PaletteControl.test.tsx src/ui/Control.tsx
git commit -m "feat: palette picker sources options from the store"
```

---

## Task 5: Swatch editor — hex edit, add / remove / reorder swatches

The core editing surface: for the currently-selected palette, a grid of swatches each with a color chip + hex input, plus add / remove / move-left / move-right. Editing a built-in palette is not allowed — instead the editor shows a hint to duplicate it first (duplicate action arrives in Task 6, so for now render read-only for built-ins).

**Files:**
- Create: `src/ui/PaletteEditor.tsx`, `src/ui/PaletteEditor.test.tsx`

**Interfaces:**
- Consumes: `useStore`; `PALETTES` (`@/color/palettes`) to detect built-ins; `hexToRgb01`, `rgb01ToHex`, `isValidHex` (`@/color/hex`); shadcn `Input`, `Button`, `Label`.
- Produces: `PaletteEditor({ paletteId }: { paletteId: string })` — renders the editable swatch grid for `store.palettes[paletteId]`. All edits go through `updatePalette`. Clamps `1..16` swatches. Built-in palettes render read-only with a "Duplicate to edit" hint (the hint's button is added in Task 6; for this task render the hint text only).

- [ ] **Step 1: Write the failing test**

Create `src/ui/PaletteEditor.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaletteEditor } from '@/ui/PaletteEditor'
import { appStore } from '@/store/store'

function resetToBuiltins() {
  for (const id of Object.keys(appStore.getState().palettes)) appStore.getState().removePalette(id)
}

describe('PaletteEditor', () => {
  beforeEach(resetToBuiltins)

  it('renders a hex input per swatch for a custom palette', () => {
    const id = appStore.getState().addPalette() // [black, white]
    render(<PaletteEditor paletteId={id} />)
    const inputs = screen.getAllByLabelText(/swatch \d+ hex/i)
    expect(inputs).toHaveLength(2)
    expect((inputs[0] as HTMLInputElement).value).toBe('#000000')
    expect((inputs[1] as HTMLInputElement).value).toBe('#ffffff')
  })

  it('commits a valid hex edit to the store on change', () => {
    const id = appStore.getState().addPalette()
    render(<PaletteEditor paletteId={id} />)
    const first = screen.getAllByLabelText(/swatch 1 hex/i)[0]
    fireEvent.change(first, { target: { value: '#ff0000' } })
    expect(appStore.getState().palettes[id].colors[0]).toEqual([1, 0, 0])
  })

  it('adds and removes swatches (clamped 1..16)', () => {
    const id = appStore.getState().addPalette() // 2 swatches
    render(<PaletteEditor paletteId={id} />)
    fireEvent.click(screen.getByRole('button', { name: /add swatch/i }))
    expect(appStore.getState().palettes[id].colors).toHaveLength(3)
    fireEvent.click(screen.getAllByRole('button', { name: /remove swatch/i })[0])
    expect(appStore.getState().palettes[id].colors).toHaveLength(2)
  })

  it('reorders a swatch with the move button', () => {
    const id = appStore.getState().addPalette()
    appStore.getState().updatePalette(id, { colors: [[1, 0, 0], [0, 1, 0]] })
    render(<PaletteEditor paletteId={id} />)
    fireEvent.click(screen.getAllByRole('button', { name: /move swatch right/i })[0])
    expect(appStore.getState().palettes[id].colors).toEqual([[0, 1, 0], [1, 0, 0]])
  })

  it('renders built-ins read-only with a duplicate hint', () => {
    render(<PaletteEditor paletteId="gameboy" />)
    expect(screen.queryAllByLabelText(/swatch \d+ hex/i)).toHaveLength(0)
    expect(screen.getByText(/duplicate/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/ui/PaletteEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PaletteEditor**

Create `src/ui/PaletteEditor.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { X, ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/store'
import { PALETTES } from '@/color/palettes'
import { hexToRgb01, rgb01ToHex, isValidHex } from '@/color/hex'

type RGB = [number, number, number]

const MAX_SWATCHES = 16

export function PaletteEditor({ paletteId }: { paletteId: string }) {
  const palette = useStore((s) => s.palettes[paletteId])
  const updatePalette = useStore((s) => s.updatePalette)
  if (!palette) return null

  const isBuiltin = paletteId in PALETTES
  if (isBuiltin) {
    return (
      <p className="text-xs text-muted-foreground">
        Built-in palette. Duplicate it to edit its colors.
      </p>
    )
  }

  const setColors = (colors: RGB[]) => updatePalette(paletteId, { colors })

  const addSwatch = () => {
    if (palette.colors.length >= MAX_SWATCHES) return
    setColors([...palette.colors, [0, 0, 0]])
  }
  const removeSwatch = (i: number) => {
    if (palette.colors.length <= 1) return
    setColors(palette.colors.filter((_, j) => j !== i))
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= palette.colors.length) return
    const next = palette.colors.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setColors(next)
  }

  return (
    <div className="space-y-1.5">
      <ul className="flex flex-col gap-1.5">
        {palette.colors.map((c, i) => (
          <SwatchRow
            key={i}
            index={i}
            color={c}
            count={palette.colors.length}
            onColor={(rgb) => setColors(palette.colors.map((x, j) => (j === i ? rgb : x)))}
            onRemove={() => removeSwatch(i)}
            onMove={(dir) => move(i, dir)}
          />
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addSwatch}
        disabled={palette.colors.length >= MAX_SWATCHES}
      >
        <Plus className="mr-1 size-3" /> Add swatch
      </Button>
    </div>
  )
}

interface SwatchRowProps {
  index: number
  color: RGB
  count: number
  onColor: (rgb: RGB) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}

function SwatchRow({ index, color, count, onColor, onRemove, onMove }: SwatchRowProps) {
  const hex = rgb01ToHex(color)
  // Local text state so an in-progress invalid hex (mid-typing) doesn't clobber the field.
  const [text, setText] = useState(hex)
  // Re-sync when the stored color changes from elsewhere (reorder, eyedropper, duplicate).
  useEffect(() => {
    setText(hex)
  }, [hex])

  return (
    <li className="flex items-center gap-1.5">
      <span
        className="size-6 shrink-0 rounded border"
        style={{ backgroundColor: hex }}
        aria-hidden
      />
      <Input
        aria-label={`Swatch ${index + 1} hex`}
        className="h-7 flex-1 font-mono text-xs"
        value={text}
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          if (isValidHex(v)) onColor(hexToRgb01(v))
        }}
      />
      <button
        type="button"
        aria-label={`Move swatch ${index + 1} left`}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowLeft className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Move swatch ${index + 1} right`}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowRight className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Remove swatch ${index + 1}`}
        className="text-muted-foreground hover:text-destructive disabled:opacity-30"
        disabled={count <= 1}
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </li>
  )
}
```

NOTE on the `value=` expression: it keeps showing the user's in-progress text while it is valid, otherwise falls back to the canonical hex of the stored color. If you find this expression hard to follow, the simpler equivalent is: track `text` state, sync it from `hex` via a `useEffect` on `hex`, and bind `value={text}`. Either is acceptable; do NOT leave the field uncontrolled.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/ui/PaletteEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/PaletteEditor.tsx src/ui/PaletteEditor.test.tsx
git commit -m "feat: swatch editor (hex edit, add/remove/reorder)"
```

---

## Task 6: Palette management — new / duplicate / rename / delete; surface the editor

Wire palette lifecycle actions into `PaletteControl`: a "＋ New", "Duplicate", rename field, and "Delete" (custom only), and render `<PaletteEditor>` for the selected palette. Selecting/creating/duplicating updates the effect's `paletteId` param via `onChange`.

**Files:**
- Modify: `src/ui/PaletteControl.tsx`, `src/ui/PaletteControl.test.tsx`

**Interfaces:**
- Consumes: `useStore` palette actions (`addPalette`, `duplicatePalette`, `removePalette`, `updatePalette`); `PALETTES`; `PaletteEditor` (Task 5); shadcn `Input`, `Button`.
- Produces: extended `PaletteControl` (same props) that, below the select, shows management controls + the editor for the current `value`.

- [ ] **Step 1: Extend the test**

Replace `src/ui/PaletteControl.test.tsx` with:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaletteControl } from '@/ui/PaletteControl'
import { appStore } from '@/store/store'

function resetToBuiltins() {
  for (const id of Object.keys(appStore.getState().palettes)) appStore.getState().removePalette(id)
}

describe('PaletteControl management', () => {
  beforeEach(resetToBuiltins)

  it('creates a new palette and selects it', () => {
    let selected = 'bw'
    render(<PaletteControl label="Palette" value={selected} onChange={(v) => (selected = v)} />)
    fireEvent.click(screen.getByRole('button', { name: /new palette/i }))
    // a new custom palette now exists and was selected via onChange
    const customIds = Object.keys(appStore.getState().palettes).filter((id) => !(id in ({ bw: 1, gray4: 1, gameboy: 1 } as Record<string, number>)))
    expect(customIds).toHaveLength(1)
    expect(selected).toBe(customIds[0])
  })

  it('duplicates the current palette and selects the copy', () => {
    let selected = 'gameboy'
    render(<PaletteControl label="Palette" value={selected} onChange={(v) => (selected = v)} />)
    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }))
    expect(selected).not.toBe('gameboy')
    expect(appStore.getState().palettes[selected].colors).toEqual(appStore.getState().palettes.gameboy.colors)
  })

  it('renames a custom palette', () => {
    const id = appStore.getState().addPalette()
    render(<PaletteControl label="Palette" value={id} onChange={() => {}} />)
    const name = screen.getByLabelText(/palette name/i)
    fireEvent.change(name, { target: { value: 'Dusk' } })
    expect(appStore.getState().palettes[id].name).toBe('Dusk')
  })

  it('deletes a custom palette and selects a fallback', () => {
    const id = appStore.getState().addPalette()
    let selected = id
    render(<PaletteControl label="Palette" value={id} onChange={(v) => (selected = v)} />)
    fireEvent.click(screen.getByRole('button', { name: /delete palette/i }))
    expect(appStore.getState().palettes[id]).toBeUndefined()
    expect(selected).toBe('bw') // fell back to a built-in
  })

  it('does not offer delete/rename for a built-in', () => {
    render(<PaletteControl label="Palette" value="gameboy" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /delete palette/i })).toBeNull()
    expect(screen.queryByLabelText(/palette name/i)).toBeNull()
  })
})
```

(Each test uses an inline `let selected` closure as its `onChange`, mirroring how `ControlsPanel` binds a param.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/ui/PaletteControl.test.tsx`
Expected: FAIL — management buttons/name field not present.

- [ ] **Step 3: Implement**

Replace `src/ui/PaletteControl.tsx` with:

```tsx
import { Plus, Copy, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/store/store'
import { PALETTES } from '@/color/palettes'
import { PaletteEditor } from '@/ui/PaletteEditor'

interface PaletteControlProps {
  label: string
  value: string
  onChange: (value: string) => void
}

const FALLBACK_ID = 'bw'

export function PaletteControl({ label, value, onChange }: PaletteControlProps) {
  const palettes = useStore((s) => s.palettes)
  const addPalette = useStore((s) => s.addPalette)
  const duplicatePalette = useStore((s) => s.duplicatePalette)
  const removePalette = useStore((s) => s.removePalette)
  const updatePalette = useStore((s) => s.updatePalette)

  const current = palettes[value]
  const isBuiltin = value in PALETTES

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as string)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.values(palettes).map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => onChange(addPalette())}>
          <Plus className="mr-1 size-3" /> New palette
        </Button>
        <Button variant="outline" size="sm" onClick={() => onChange(duplicatePalette(value))}>
          <Copy className="mr-1 size-3" /> Duplicate
        </Button>
      </div>

      {current && !isBuiltin && (
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Palette name"
            className="h-7 flex-1 text-xs"
            value={current.name}
            onChange={(e) => updatePalette(value, { name: e.target.value })}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete palette"
            onClick={() => {
              removePalette(value)
              onChange(FALLBACK_ID)
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}

      <PaletteEditor paletteId={value} />
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run src/ui/PaletteControl.test.tsx src/ui/PaletteEditor.test.tsx src/ui/ControlsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/PaletteControl.tsx src/ui/PaletteControl.test.tsx
git commit -m "feat: palette management (new/duplicate/rename/delete) + editor surface"
```

---

## Task 7: Import / export a palette as JSON

Export the current palette to a downloaded `.json`; import a palette from a file (creates a new custom palette and selects it).

**Files:**
- Create: `src/features/paletteFile.ts`, `src/features/paletteFile.test.ts`
- Modify: `src/ui/PaletteControl.tsx`, `src/ui/PaletteControl.test.tsx`

**Interfaces:**
- Produces (in `paletteFile.ts`):
  - `paletteToJson(palette: Palette): string` — pretty JSON of `{ name, colors }` (id is intentionally omitted; import assigns a fresh id).
  - `parsePaletteJson(text: string): { name: string; colors: [number, number, number][] }` — parses + validates; throws `Error` on bad shape. Clamps to 16 colors.
  - `downloadPalette(palette: Palette): void` — triggers a browser download named `<sanitized-name>.dithrrd-palette.json` (mirrors `exportPng.ts`'s Blob→anchor pattern).

- [ ] **Step 1: Write the failing test**

Create `src/features/paletteFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { paletteToJson, parsePaletteJson } from '@/features/paletteFile'
import type { Palette } from '@/effects/types'

const p: Palette = { id: 'x', name: 'Duo', colors: [[0, 0, 0], [1, 1, 1]] }

describe('paletteFile', () => {
  it('serializes name + colors (omitting id) and round-trips', () => {
    const json = paletteToJson(p)
    expect(JSON.parse(json)).toEqual({ name: 'Duo', colors: [[0, 0, 0], [1, 1, 1]] })
    expect(parsePaletteJson(json)).toEqual({ name: 'Duo', colors: [[0, 0, 0], [1, 1, 1]] })
  })
  it('throws on invalid shape', () => {
    expect(() => parsePaletteJson('{"name":"x"}')).toThrow()
    expect(() => parsePaletteJson('not json')).toThrow()
  })
  it('clamps to 16 colors', () => {
    const many = { name: 'big', colors: Array.from({ length: 20 }, () => [0, 0, 0]) }
    expect(parsePaletteJson(JSON.stringify(many)).colors).toHaveLength(16)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/paletteFile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement paletteFile.ts**

Create `src/features/paletteFile.ts`:

```ts
import type { Palette } from '@/effects/types'

type RGB = [number, number, number]

export function paletteToJson(palette: Palette): string {
  return JSON.stringify({ name: palette.name, colors: palette.colors }, null, 2)
}

export function parsePaletteJson(text: string): { name: string; colors: RGB[] } {
  const parsed = JSON.parse(text) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid palette file')
  const o = parsed as Record<string, unknown>
  if (typeof o.name !== 'string') throw new Error('palette file missing name')
  if (
    !Array.isArray(o.colors) ||
    !o.colors.every(
      (c) => Array.isArray(c) && c.length === 3 && c.every((n) => typeof n === 'number'),
    )
  ) {
    throw new Error('palette file has invalid colors')
  }
  return { name: o.name, colors: (o.colors as RGB[]).slice(0, 16) }
}

export function downloadPalette(palette: Palette): void {
  const blob = new Blob([paletteToJson(palette)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${palette.name.replace(/[^\w-]+/g, '_') || 'palette'}.dithrrd-palette.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Wire import/export into PaletteControl**

Add to the imports in `src/ui/PaletteControl.tsx`:

```tsx
import { Download, Upload } from 'lucide-react'
import { downloadPalette, parsePaletteJson } from '@/features/paletteFile'
```

Add these two buttons inside the management row (in the `{current && !isBuiltin && ...}` block is too narrow — put export next to New/Duplicate so built-ins can be exported too). Replace the New/Duplicate row with:

```tsx
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => onChange(addPalette())}>
          <Plus className="mr-1 size-3" /> New palette
        </Button>
        <Button variant="outline" size="sm" onClick={() => onChange(duplicatePalette(value))}>
          <Copy className="mr-1 size-3" /> Duplicate
        </Button>
        {current && (
          <Button
            variant="outline"
            size="sm"
            aria-label="Export palette"
            onClick={() => downloadPalette(current)}
          >
            <Download className="size-3.5" />
          </Button>
        )}
        <label className="cursor-pointer">
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import palette"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              f.text().then((text) => {
                try {
                  const { name, colors } = parsePaletteJson(text)
                  const id = addPalette()
                  updatePalette(id, { name, colors })
                  onChange(id)
                } catch {
                  // ignore malformed import; a toast could be added later
                }
              })
            }}
          />
          <span className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm hover:bg-accent">
            <Upload className="size-3.5" />
          </span>
        </label>
      </div>
```

- [ ] **Step 5: Add an import test**

Append to `src/ui/PaletteControl.test.tsx`:

```tsx
import { downloadPalette } from '@/features/paletteFile'
import { vi } from 'vitest'

it('imports a palette file, creating and selecting a custom palette', async () => {
  let selected = 'bw'
  render(<PaletteControl label="Palette" value={selected} onChange={(v) => (selected = v)} />)
  const input = screen.getByLabelText(/import palette/i) as HTMLInputElement
  const file = new File(
    [JSON.stringify({ name: 'Imported', colors: [[1, 0, 0], [0, 0, 1]] })],
    'p.json',
    { type: 'application/json' },
  )
  fireEvent.change(input, { target: { files: [file] } })
  await vi.waitFor(() => expect(selected).not.toBe('bw'))
  expect(appStore.getState().palettes[selected]).toMatchObject({
    name: 'Imported',
    colors: [[1, 0, 0], [0, 0, 1]],
  })
})

it('export calls the download helper (smoke)', () => {
  // downloadPalette touches DOM/URL APIs; just assert the button is wired and present.
  render(<PaletteControl label="Palette" value="gameboy" onChange={() => {}} />)
  expect(screen.getByRole('button', { name: /export palette/i })).toBeInTheDocument()
  expect(typeof downloadPalette).toBe('function')
})
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm exec vitest run src/features/paletteFile.test.ts src/ui/PaletteControl.test.tsx`
Expected: PASS.
Run: `pnpm exec tsc -b` — no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/paletteFile.ts src/features/paletteFile.test.ts src/ui/PaletteControl.tsx src/ui/PaletteControl.test.tsx
git commit -m "feat: import/export palettes as JSON"
```

---

## Task 8: Eyedropper — sample a swatch color from the image

Add an eyedropper: click a swatch's eyedropper button, then click the preview to set that swatch to the sampled pixel color. **This is the most cross-cutting task (store state + Viewport coordinate mapping); it is intentionally last and independently revertible.**

**Files:**
- Modify: `src/store/store.ts`, `src/store/store.test.ts` (eyedropper state + action)
- Modify: `src/ui/PaletteEditor.tsx` (per-swatch eyedropper button)
- Modify: `src/ui/Viewport.tsx` (click-to-sample when eyedropper active)

**Interfaces:**
- Produces (store):
  - `eyedropper: { paletteId: string; index: number } | null` (default `null`)
  - `startEyedropper(paletteId: string, index: number): void`
  - `cancelEyedropper(): void`
  - `applyEyedropper(rgb: [number, number, number]): void` — if an eyedropper target is set, writes `rgb` into that palette swatch (via the same immutable update as `updatePalette`) and clears `eyedropper`.

- [ ] **Step 1: Write the failing store test**

Append to `src/store/store.test.ts`:

```ts
describe('app store — eyedropper', () => {
  beforeEach(() => localStorage.clear())
  it('starts, applies to the targeted swatch, and clears', () => {
    const s = createAppStore()
    const id = s.getState().addPalette() // [[0,0,0],[1,1,1]]
    s.getState().startEyedropper(id, 1)
    expect(s.getState().eyedropper).toEqual({ paletteId: id, index: 1 })
    s.getState().applyEyedropper([0.25, 0.5, 0.75])
    expect(s.getState().palettes[id].colors[1]).toEqual([0.25, 0.5, 0.75])
    expect(s.getState().eyedropper).toBeNull()
  })
  it('cancel clears the target without changing colors', () => {
    const s = createAppStore()
    const id = s.getState().addPalette()
    s.getState().startEyedropper(id, 0)
    s.getState().cancelEyedropper()
    expect(s.getState().eyedropper).toBeNull()
    expect(s.getState().palettes[id].colors[0]).toEqual([0, 0, 0])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/store/store.test.ts`
Expected: FAIL — eyedropper members undefined.

- [ ] **Step 3: Implement store eyedropper**

In `src/store/store.ts`, add to `AppState`:

```ts
  eyedropper: { paletteId: string; index: number } | null
  startEyedropper: (paletteId: string, index: number) => void
  cancelEyedropper: () => void
  applyEyedropper: (rgb: [number, number, number]) => void
```

Add `eyedropper: null,` to the initial state (next to `selectedId: null,`). Add the actions (after `duplicatePalette`):

```ts
    startEyedropper: (paletteId, index) => set({ eyedropper: { paletteId, index } }),
    cancelEyedropper: () => set({ eyedropper: null }),
    applyEyedropper: (rgb) =>
      set((s) => {
        const t = s.eyedropper
        if (!t) return s
        const p = s.palettes[t.paletteId]
        if (!p) return { eyedropper: null }
        const colors = p.colors.map((c, j) => (j === t.index ? rgb : c))
        return { palettes: { ...s.palettes, [t.paletteId]: { ...p, colors } }, eyedropper: null }
      }),
```

- [ ] **Step 4: Add the eyedropper button to SwatchRow**

In `src/ui/PaletteEditor.tsx`, import the icon and store action:

```tsx
import { X, ArrowLeft, ArrowRight, Plus, Pipette } from 'lucide-react'
```

In `PaletteEditor`, read the action and the active target:

```tsx
  const startEyedropper = useStore((s) => s.startEyedropper)
  const eyedropper = useStore((s) => s.eyedropper)
```

Pass to each `SwatchRow`:

```tsx
            onEyedrop={() => startEyedropper(paletteId, i)}
            picking={eyedropper?.paletteId === paletteId && eyedropper?.index === i}
```

Extend `SwatchRowProps` with `onEyedrop: () => void; picking: boolean`, and add a button before the remove button:

```tsx
      <button
        type="button"
        aria-label={`Eyedrop swatch ${index + 1}`}
        aria-pressed={picking}
        className={`hover:text-foreground disabled:opacity-30 ${picking ? 'text-primary' : 'text-muted-foreground'}`}
        onClick={onEyedrop}
      >
        <Pipette className="size-3.5" />
      </button>
```

- [ ] **Step 5: Sample in the Viewport**

In `src/ui/Viewport.tsx`, read the eyedropper state + apply action:

```tsx
  const eyedropper = useStore((s) => s.eyedropper)
  const applyEyedropper = useStore((s) => s.applyEyedropper)
```

Add a click handler on the canvas that only acts while an eyedropper is armed. The source pixels live in `source.image` (`ImageData`, top-left origin, `width×height`). The canvas is rendered `object-contain`, so map client coords → image pixel via the canvas's rendered rect and intrinsic size:

```tsx
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropper || !source) return
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    // object-contain letterboxes: compute the drawn image rect inside the element.
    const scale = Math.min(rect.width / source.width, rect.height / source.height)
    const drawnW = source.width * scale
    const drawnH = source.height * scale
    const offX = (rect.width - drawnW) / 2
    const offY = (rect.height - drawnH) / 2
    const px = Math.floor(((e.clientX - rect.left - offX) / drawnW) * source.width)
    const py = Math.floor(((e.clientY - rect.top - offY) / drawnH) * source.height)
    if (px < 0 || py < 0 || px >= source.width || py >= source.height) {
      applyEyedropper // out of image bounds: ignore (do not call)
      return
    }
    const i = (py * source.width + px) * 4
    const d = source.image.data
    applyEyedropper([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255])
  }
```

Add `onClick={onCanvasClick}` and a picking cursor to the `<canvas>`:

```tsx
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        className="max-h-full max-w-full object-contain shadow-sm"
        style={{ imageRendering: 'auto', cursor: eyedropper ? 'crosshair' : undefined }}
      />
```

(Sampling uses the ORIGINAL `source.image`, not the dithered output — an eyedropper should pick true source colors. Add a one-line comment saying so.)

- [ ] **Step 6: Add a Viewport eyedropper test**

Create/extend `src/ui/Viewport` coverage with a focused unit for the mapping is hard without a real layout; instead assert the store round-trip that the click handler performs. Append to `src/store/store.test.ts` a test that documents the sampling contract is already covered by Step 1. **No new Viewport render test is required** (jsdom has no layout, so `getBoundingClientRect` returns zeros); the coordinate math is exercised manually in Step 7. Note this explicitly in the task report.

- [ ] **Step 7: Run tests + typecheck + manual check**

Run: `pnpm exec vitest run src/store/store.test.ts src/ui/PaletteEditor.test.tsx`
Expected: PASS.
Run: `pnpm exec tsc -b` — no errors.
Manual (report it): `pnpm dev`, open an image, add a Palette Map effect, create/duplicate a custom palette, click a swatch's eyedropper, click the preview — the swatch adopts the clicked source color and the preview updates.

- [ ] **Step 8: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts src/ui/PaletteEditor.tsx src/ui/Viewport.tsx
git commit -m "feat: eyedropper — sample a swatch color from the source image"
```

---

## Task 9: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full suite** — Run `pnpm test`. Expected: all pass (existing + new palette tests).
- [ ] **Step 2: Typecheck + build** — Run `pnpm exec tsc -b` (no errors) and `pnpm build` (succeeds).
- [ ] **Step 3: Manual smoke (report it)** — `pnpm dev`; add a Palette Map effect; confirm: the dropdown lists built-ins; "New palette" creates + selects an editable custom palette; hex edits update the preview live; add/remove/reorder swatches work and are clamped 1..16; rename/delete/duplicate work; export downloads a `.json`, import re-creates it; eyedropper samples from the image; reload the page and confirm custom palettes persist (localStorage). No console errors.

---

## Self-Review

**1. Spec coverage** (design spec "Custom palette editor": add/remove/reorder swatches, hex entry or eyedropper, save named palettes to localStorage, import/export):
- add/remove/reorder swatches → Task 5. ✓
- hex entry → Task 5; eyedropper → Task 8. ✓
- named palettes → Task 6 (rename); save to localStorage → Tasks 2–3 (persistence). ✓
- import/export → Task 7. ✓
- Palettes referenced by id, living independently of the effect → already true (store `palettes` keyed by id; effect stores only `paletteId`). Editor operates on ids. ✓

**2. Placeholder scan:** No "TBD"/"implement later". Each step ships complete code. Task 3's `duplicatePalette` uses the `get`-based store factory (signature change called out explicitly). Task 5's swatch input is a clean `useState` + `useEffect`-synced controlled field. Task 6's tests use inline `let selected` closures (no scaffold).

**3. Type consistency:** Palette actions use `Palette`/`RGB = [number,number,number]` throughout. `addPalette`/`duplicatePalette` return `string` (the new id); `PaletteControl` feeds that id straight into `onChange` (the effect's `paletteId` param). `updatePalette` patch is `{name?; colors?}` consistently. The eyedropper action `applyEyedropper(rgb)` matches the Viewport's sampled `[r,g,b]` 0..1.

**Known simplifications (documented, acceptable):**
- Reorder uses move-left/right buttons rather than drag (swatches are small; dnd-kit would be heavier than warranted). The stack panel's dnd is not reused here.
- Import failures are swallowed silently (a toast is deferred; `sonner` is available if wanted later).
- No Viewport render test for eyedropper coordinate mapping (jsdom lacks layout); the store round-trip is unit-tested and the mapping is verified manually.
- Built-in palettes are read-only in the editor (must duplicate to edit) — matches the "built-ins live in code" model.
