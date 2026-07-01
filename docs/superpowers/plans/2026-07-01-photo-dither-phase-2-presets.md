# Photo Dither Customizer — Phase 2D: Preset Save/Load + URL Share — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save the current look (the effect stack + any custom palettes it references) as a named preset in localStorage, export/import presets as a file, and share a preset via a URL that rebuilds the exact look on open.

**Architecture:** A **preset** is a pure serialization of `{ version, stack, palettes }` where `palettes` are only the *custom* (non-built-in) palettes referenced by the stack — built-ins live in code. Pure functions build/serialize/parse presets; a URL codec encodes a preset into a `?p=` query param (dependency-free base64url of the JSON); localStorage holds named presets. A single store action `loadPreset` merges the preset's palettes and replaces the stack. On startup `App.tsx` checks for `?p=` and applies it, then strips the param. All of this is additive — the engine, effects, and existing store actions are untouched.

**Tech Stack:** TypeScript, React, Zustand, shadcn/@base-ui, Vitest + Testing Library. No new runtime dependencies.

## Global Constraints

- **Package manager:** pnpm only. Focused test: `pnpm exec vitest run <file>`; full: `pnpm test`. Typecheck: `pnpm exec tsc -b`. Path alias `@/` → `src/`. **Do NOT add npm dependencies** (URL encoding is dependency-free base64url; compression is deferred — see Self-Review).
- **shadcn is @base-ui (base-nova), NOT Radix.** Use `render={<Comp/>}` for polymorphic composition, NOT `asChild`. Verify generated component prop APIs (`DropdownMenu`, `Button`) before use. The existing `StackPanel.tsx` uses the `DropdownMenu` family correctly — mirror it.
- **Types:** `StackNode = { id: string; type: string; enabled: boolean; params: Params }` from `@/engine/planPasses`; `Palette = { id: string; name: string; colors: [number,number,number][] }` from `@/effects/types`; `Params = Record<string, number|string|boolean>`.
- **Built-in palette ids** are the keys of `PALETTES` (`@/color/palettes`): `bw`, `gray4`, `gameboy`. Only NON-built-in palettes are embedded in a preset and persisted.
- **localStorage keys:** presets under `dithrrd.presets.v1`. All storage access is try/catch-guarded — a failure never throws into the app.
- **Preset schema version:** `v: 1`. `parsePresetJson` accepts any object with a numeric `v`, an array `stack` of valid stack-nodes, and an array `palettes` of valid palettes; it throws on structural failure. Unknown effect `type`s in the stack are preserved as-is (the engine's `planPasses` already skips unregistered types, so a newer-version preset degrades gracefully).
- **URL param:** `p`. Loading `…/?p=<encoded>` rebuilds the look; after applying, the param is stripped via `history.replaceState` so a reload doesn't re-apply and the URL stays clean.
- **Commits:** Conventional Commits, one per task.

---

## File Structure

```
src/
  features/
    preset.ts            # CREATE: Preset type, buildPreset, presetToJson, parsePresetJson
    preset.test.ts       # CREATE
    presetUrl.ts         # CREATE: encodePresetParam / decodePresetParam (base64url)
    presetUrl.test.ts    # CREATE
    presetStorage.ts     # CREATE: named presets in localStorage (load/save/add/delete)
    presetStorage.test.ts # CREATE
  store/
    store.ts             # MODIFY: loadPreset action (merge palettes + replace stack)
    store.test.ts        # MODIFY
  App.tsx                # MODIFY: on mount, apply ?p= preset then strip the param
  ui/
    PresetMenu.tsx       # CREATE: Toolbar preset controls (save/load/delete/share/import/export)
    PresetMenu.test.tsx  # CREATE
    Toolbar.tsx          # MODIFY: render <PresetMenu/> in the action row
```

---

## Task 1: Preset core — build / serialize / parse

**Files:** Create `src/features/preset.ts`, `src/features/preset.test.ts`.

**Interfaces:**
- Consumes: `StackNode` (`@/engine/planPasses`), `Palette` (`@/effects/types`), `PALETTES` (`@/color/palettes`).
- Produces:
  - `interface Preset { v: number; stack: StackNode[]; palettes: Palette[] }`
  - `buildPreset(stack: StackNode[], palettes: Record<string, Palette>): Preset` — deep-clones the stack; collects the custom (non-built-in) palettes whose id appears as any node's `paletteId` param.
  - `presetToJson(preset: Preset): string` — pretty JSON.
  - `parsePresetJson(text: string): Preset` — parses + validates; throws `Error` on bad shape; preserves unknown node types.

- [ ] **Step 1: Write the failing test**

Create `src/features/preset.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildPreset, presetToJson, parsePresetJson } from '@/features/preset'
import type { StackNode } from '@/engine/planPasses'
import type { Palette } from '@/effects/types'

const custom: Palette = { id: 'c1', name: 'Mine', colors: [[1, 0, 0], [0, 0, 1]] }
const palettes: Record<string, Palette> = {
  bw: { id: 'bw', name: 'B&W', colors: [[0, 0, 0], [1, 1, 1]] }, // built-in
  c1: custom,
}
const stack: StackNode[] = [
  { id: 'n1', type: 'duotone', enabled: true, params: { paletteId: 'c1' } },
  { id: 'n2', type: 'palette', enabled: true, params: { paletteId: 'bw' } },
  { id: 'n3', type: 'bayer', enabled: false, params: { matrix: '4', levels: 2 } },
]

describe('preset core', () => {
  it('embeds only the custom palettes referenced by the stack', () => {
    const preset = buildPreset(stack, palettes)
    expect(preset.v).toBe(1)
    expect(preset.palettes).toEqual([custom]) // c1 referenced; bw is built-in -> excluded
    expect(preset.stack).toHaveLength(3)
  })
  it('deep-clones the stack (no shared references)', () => {
    const preset = buildPreset(stack, palettes)
    expect(preset.stack[0]).not.toBe(stack[0])
    expect(preset.stack[0].params).not.toBe(stack[0].params)
    expect(preset.stack[0].params).toEqual({ paletteId: 'c1' })
  })
  it('round-trips through JSON', () => {
    const preset = buildPreset(stack, palettes)
    expect(parsePresetJson(presetToJson(preset))).toEqual(preset)
  })
  it('throws on structurally invalid JSON', () => {
    expect(() => parsePresetJson('not json')).toThrow()
    expect(() => parsePresetJson('{"v":1}')).toThrow() // missing stack/palettes
    expect(() => parsePresetJson(JSON.stringify({ v: 1, stack: 'x', palettes: [] }))).toThrow()
  })
  it('preserves unknown effect types (forward-compat)', () => {
    const p = { v: 1, stack: [{ id: 'x', type: 'future-fx', enabled: true, params: {} }], palettes: [] }
    expect(parsePresetJson(JSON.stringify(p)).stack[0].type).toBe('future-fx')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/preset.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/preset.ts`:

```ts
import type { StackNode } from '@/engine/planPasses'
import type { Palette } from '@/effects/types'
import { PALETTES } from '@/color/palettes'

export interface Preset {
  v: number
  stack: StackNode[]
  palettes: Palette[]
}

const PRESET_VERSION = 1

export function buildPreset(stack: StackNode[], palettes: Record<string, Palette>): Preset {
  const referenced = new Set<string>()
  for (const node of stack) {
    const id = node.params.paletteId
    if (typeof id === 'string' && !(id in PALETTES) && palettes[id]) referenced.add(id)
  }
  return {
    v: PRESET_VERSION,
    stack: stack.map((n) => ({ ...n, params: { ...n.params } })),
    palettes: [...referenced].map((id) => {
      const p = palettes[id]
      return { id: p.id, name: p.name, colors: p.colors.map((c) => [c[0], c[1], c[2]] as [number, number, number]) }
    }),
  }
}

export function presetToJson(preset: Preset): string {
  return JSON.stringify(preset, null, 2)
}

function isStackNode(x: unknown): x is StackNode {
  if (typeof x !== 'object' || x === null) return false
  const n = x as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    typeof n.type === 'string' &&
    typeof n.enabled === 'boolean' &&
    typeof n.params === 'object' && n.params !== null
  )
}

function isPalette(x: unknown): x is Palette {
  if (typeof x !== 'object' || x === null) return false
  const p = x as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    Array.isArray(p.colors) &&
    p.colors.every((c) => Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === 'number'))
  )
}

export function parsePresetJson(text: string): Preset {
  const parsed = JSON.parse(text) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid preset')
  const o = parsed as Record<string, unknown>
  if (typeof o.v !== 'number') throw new Error('preset missing version')
  if (!Array.isArray(o.stack) || !o.stack.every(isStackNode)) throw new Error('preset has invalid stack')
  if (!Array.isArray(o.palettes) || !o.palettes.every(isPalette)) throw new Error('preset has invalid palettes')
  return { v: o.v, stack: o.stack as StackNode[], palettes: o.palettes as Palette[] }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/preset.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/preset.ts src/features/preset.test.ts
git commit -m "feat: preset serialization (stack + referenced custom palettes)"
```

---

## Task 2: URL codec (dependency-free base64url)

**Files:** Create `src/features/presetUrl.ts`, `src/features/presetUrl.test.ts`.

**Interfaces:**
- Consumes: `Preset`, `presetToJson`, `parsePresetJson` (Task 1).
- Produces:
  - `encodePresetParam(preset: Preset): string` — JSON → UTF-8 bytes → URL-safe base64 (no padding).
  - `decodePresetParam(param: string): Preset` — inverse; validates via `parsePresetJson`; throws on bad input.

- [ ] **Step 1: Write the failing test**

Create `src/features/presetUrl.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encodePresetParam, decodePresetParam } from '@/features/presetUrl'
import type { Preset } from '@/features/preset'

const preset: Preset = {
  v: 1,
  stack: [{ id: 'n1', type: 'duotone', enabled: true, params: { paletteId: 'c1' } }],
  palettes: [{ id: 'c1', name: 'Sűnset ✦', colors: [[1, 0, 0], [0, 0, 1]] }], // unicode name
}

describe('presetUrl', () => {
  it('round-trips a preset (incl. unicode) through the URL param', () => {
    const param = encodePresetParam(preset)
    expect(param).not.toMatch(/[+/=]/) // url-safe, unpadded
    expect(decodePresetParam(param)).toEqual(preset)
  })
  it('throws on a corrupt param', () => {
    expect(() => decodePresetParam('!!!not-base64!!!')).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/presetUrl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/presetUrl.ts`:

```ts
import type { Preset } from '@/features/preset'
import { presetToJson, parsePresetJson } from '@/features/preset'

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encodePresetParam(preset: Preset): string {
  return bytesToBase64Url(new TextEncoder().encode(presetToJson(preset)))
}

export function decodePresetParam(param: string): Preset {
  const json = new TextDecoder().decode(base64UrlToBytes(param))
  return parsePresetJson(json)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/presetUrl.test.ts`
Expected: PASS. (Note: `atob('!!!…')` throws in jsdom/browsers on invalid base64, satisfying the corrupt-param test.)

- [ ] **Step 5: Commit**

```bash
git add src/features/presetUrl.ts src/features/presetUrl.test.ts
git commit -m "feat: encode/decode a preset into a URL-safe query param"
```

---

## Task 3: Named presets in localStorage

**Files:** Create `src/features/presetStorage.ts`, `src/features/presetStorage.test.ts`.

**Interfaces:**
- Consumes: `Preset`, `parsePresetJson`, `presetToJson` (Task 1).
- Produces:
  - `interface NamedPreset { id: string; name: string; preset: Preset }`
  - `PRESET_STORAGE_KEY = 'dithrrd.presets.v1'`
  - `loadNamedPresets(): NamedPreset[]` — reads + validates; returns `[]` on any error, dropping invalid entries.
  - `saveNamedPresets(list: NamedPreset[]): void` — writes; swallows errors.
  - `addNamedPreset(name: string, preset: Preset): NamedPreset` — appends a new `{id: crypto.randomUUID(), name, preset}` to the stored list and returns it.
  - `deleteNamedPreset(id: string): void` — removes by id.

- [ ] **Step 1: Write the failing test**

Create `src/features/presetStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadNamedPresets, saveNamedPresets, addNamedPreset, deleteNamedPreset, PRESET_STORAGE_KEY,
} from '@/features/presetStorage'
import type { Preset } from '@/features/preset'

const preset: Preset = { v: 1, stack: [], palettes: [] }

describe('presetStorage', () => {
  beforeEach(() => localStorage.clear())

  it('returns [] when empty', () => {
    expect(loadNamedPresets()).toEqual([])
  })
  it('adds and lists a named preset', () => {
    const np = addNamedPreset('Look A', preset)
    expect(np.name).toBe('Look A')
    expect(np.id).toBeTruthy()
    expect(loadNamedPresets()).toEqual([np])
  })
  it('deletes by id', () => {
    const np = addNamedPreset('Look A', preset)
    deleteNamedPreset(np.id)
    expect(loadNamedPresets()).toEqual([])
  })
  it('returns [] on malformed JSON and drops invalid entries', () => {
    localStorage.setItem(PRESET_STORAGE_KEY, '{bad')
    expect(loadNamedPresets()).toEqual([])
    saveNamedPresets([{ id: 'x' } as unknown as never])
    expect(loadNamedPresets()).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/presetStorage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/presetStorage.ts`:

```ts
import type { Preset } from '@/features/preset'

export const PRESET_STORAGE_KEY = 'dithrrd.presets.v1'

export interface NamedPreset {
  id: string
  name: string
  preset: Preset
}

function isNamedPreset(x: unknown): x is NamedPreset {
  if (typeof x !== 'object' || x === null) return false
  const n = x as Record<string, unknown>
  if (typeof n.id !== 'string' || typeof n.name !== 'string') return false
  const p = n.preset as Record<string, unknown> | undefined
  return (
    typeof p === 'object' && p !== null &&
    typeof p.v === 'number' && Array.isArray(p.stack) && Array.isArray(p.palettes)
  )
}

export function loadNamedPresets(): NamedPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isNamedPreset)
  } catch {
    return []
  }
}

export function saveNamedPresets(list: NamedPreset[]): void {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // storage unavailable / over quota — non-fatal
  }
}

export function addNamedPreset(name: string, preset: Preset): NamedPreset {
  const np: NamedPreset = { id: crypto.randomUUID(), name, preset }
  saveNamedPresets([...loadNamedPresets(), np])
  return np
}

export function deleteNamedPreset(id: string): void {
  saveNamedPresets(loadNamedPresets().filter((p) => p.id !== id))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/presetStorage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/presetStorage.ts src/features/presetStorage.test.ts
git commit -m "feat: named presets in localStorage"
```

---

## Task 4: Store `loadPreset` action + apply `?p=` on startup

**Files:** Modify `src/store/store.ts`, `src/store/store.test.ts`, `src/App.tsx`.

**Interfaces:**
- Consumes: `Preset` (`@/features/preset`), `decodePresetParam` (`@/features/presetUrl`).
- Produces (store): `loadPreset(preset: Preset): void` — merges `preset.palettes` into `palettes` (by id), replaces `stack` with a fresh clone of `preset.stack`, and sets `selectedId` to the first node's id (or null). The existing singleton persistence subscription then persists any newly-merged custom palettes automatically.

- [ ] **Step 1: Write the failing store test**

Append to `src/store/store.test.ts`:

```ts
describe('app store — loadPreset', () => {
  beforeEach(() => localStorage.clear())
  it('replaces the stack and merges the preset palettes', () => {
    const s = createAppStore()
    s.getState().addNode('bayer') // pre-existing stack
    s.getState().loadPreset({
      v: 1,
      stack: [{ id: 'p1', type: 'duotone', enabled: true, params: { paletteId: 'c1' } }],
      palettes: [{ id: 'c1', name: 'Mine', colors: [[1, 0, 0], [0, 0, 1]] }],
    })
    const st = s.getState()
    expect(st.stack).toHaveLength(1)
    expect(st.stack[0].type).toBe('duotone')
    expect(st.selectedId).toBe(st.stack[0].id)
    expect(st.palettes.c1).toMatchObject({ name: 'Mine' })
    expect(st.palettes.bw).toBeTruthy() // built-ins retained
  })
  it('clones the preset stack (no shared references)', () => {
    const s = createAppStore()
    const preset = { v: 1, stack: [{ id: 'p1', type: 'bayer', enabled: true, params: { levels: 3 } }], palettes: [] }
    s.getState().loadPreset(preset)
    s.getState().updateParam(s.getState().stack[0].id, 'levels', 8)
    expect(preset.stack[0].params.levels).toBe(3) // original untouched
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/store/store.test.ts`
Expected: FAIL — `loadPreset` not defined.

- [ ] **Step 3: Add the store action**

In `src/store/store.ts`:
- Add the import: `import type { Preset } from '@/features/preset'`.
- Add to `AppState`: `loadPreset: (preset: Preset) => void`.
- Add the action (after `applyEyedropper` or near the other actions):

```ts
    loadPreset: (preset) =>
      set((s) => {
        const palettes = { ...s.palettes }
        for (const p of preset.palettes) palettes[p.id] = p
        const stack = preset.stack.map((n) => ({ ...n, params: { ...n.params } }))
        return { palettes, stack, selectedId: stack[0]?.id ?? null }
      }),
```

- [ ] **Step 4: Apply `?p=` on startup in App.tsx**

In `src/App.tsx`:
- Add imports: `import { useEffect } from 'react'` (extend the existing `useRef` import to `import { useRef, useEffect } from 'react'`); `import { decodePresetParam } from '@/features/presetUrl'`.
- Read the action: add `const loadPreset = useStore((s) => s.loadPreset)` alongside the other `useStore` calls.
- Add this effect near the top of the component body (before the `hasWebGL2` guard is fine — hooks must run unconditionally, so place the `useEffect` BEFORE the `if (!hasWebGL2()) return ...` line):

```tsx
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
```

IMPORTANT (rules of hooks): the `useEffect` must be declared BEFORE the early `if (!hasWebGL2()) return <WebGL2Fallback />` return, so hooks are called unconditionally on every render.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run src/store/store.test.ts`
Expected: PASS.
Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts src/App.tsx
git commit -m "feat: loadPreset store action + apply ?p= preset on startup"
```

---

## Task 5: Preset menu UI (save / load / delete / share / import / export)

**Files:** Create `src/ui/PresetMenu.tsx`, `src/ui/PresetMenu.test.tsx`; modify `src/ui/Toolbar.tsx`.

**Interfaces:**
- Consumes: `useStore` (`stack`, `palettes`, `loadPreset`); `buildPreset`, `presetToJson`, `parsePresetJson` (`@/features/preset`); `encodePresetParam` (`@/features/presetUrl`); `loadNamedPresets`, `addNamedPreset`, `deleteNamedPreset` (`@/features/presetStorage`); shadcn `DropdownMenu` family + `Button`; `toast` (`sonner`).
- Produces: `PresetMenu()` — a `DropdownMenu` (trigger button "Presets") with: **Save current** (adds `Preset N` to localStorage), the list of saved presets (click → `loadPreset`, each with a delete affordance), **Share link** (build preset → `encodePresetParam` → write `origin+pathname+?p=…` to the clipboard → toast), **Import…** (hidden file input → `parsePresetJson` → `loadPreset`), **Export current** (download the current preset JSON). Rendered by `Toolbar`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/PresetMenu.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PresetMenu } from '@/ui/PresetMenu'
import { appStore } from '@/store/store'
import { loadNamedPresets } from '@/features/presetStorage'
import { decodePresetParam } from '@/features/presetUrl'

function reset() {
  localStorage.clear()
  const st = appStore.getState()
  for (const n of [...st.stack]) st.removeNode(n.id)
}

describe('PresetMenu', () => {
  beforeEach(reset)

  it('saves the current stack as a named preset', () => {
    appStore.getState().addNode('bayer')
    render(<PresetMenu />)
    fireEvent.click(screen.getByRole('button', { name: /presets/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /save current/i }))
    const saved = loadNamedPresets()
    expect(saved).toHaveLength(1)
    expect(saved[0].preset.stack[0].type).toBe('bayer')
  })

  it('loads a saved preset back into the store', () => {
    appStore.getState().addNode('bayer')
    render(<PresetMenu />)
    fireEvent.click(screen.getByRole('button', { name: /presets/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /save current/i }))
    // clear the live stack, then load the saved preset
    for (const n of [...appStore.getState().stack]) appStore.getState().removeNode(n.id)
    fireEvent.click(screen.getByRole('button', { name: /presets/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Preset 1/i }))
    expect(appStore.getState().stack[0].type).toBe('bayer')
  })

  it('copies a share link whose param decodes to the current preset', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    appStore.getState().addNode('bayer')
    render(<PresetMenu />)
    fireEvent.click(screen.getByRole('button', { name: /presets/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /share link/i }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const url = writeText.mock.calls[0][0] as string
    const param = new URL(url).searchParams.get('p')!
    expect(decodePresetParam(param).stack[0].type).toBe('bayer')
  })
})
```

**Testing note (base-ui menus):** @base-ui's `DropdownMenuContent` renders in a portal and may mount its items asynchronously after the trigger is clicked. If `getByRole('menuitem', …)` can't find items synchronously, switch those queries to `await screen.findByRole('menuitem', …)` and make the test callbacks `async`. Mirror whatever the existing `src/ui/StackPanel.test.tsx` does for its Add menu (it uses the same `DropdownMenu`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/ui/PresetMenu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PresetMenu.tsx**

Create `src/ui/PresetMenu.tsx`:

```tsx
import { ChevronDown, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStore } from '@/store/store'
import { buildPreset, presetToJson, parsePresetJson } from '@/features/preset'
import { encodePresetParam } from '@/features/presetUrl'
import { loadNamedPresets, addNamedPreset, deleteNamedPreset } from '@/features/presetStorage'

export function PresetMenu() {
  const stack = useStore((s) => s.stack)
  const palettes = useStore((s) => s.palettes)
  const loadPreset = useStore((s) => s.loadPreset)
  const saved = loadNamedPresets()

  const current = () => buildPreset(stack, palettes)

  const onSave = () => {
    addNamedPreset(`Preset ${saved.length + 1}`, current())
    toast.success('Preset saved')
  }

  const onShare = () => {
    const url = `${window.location.origin}${window.location.pathname}?p=${encodePresetParam(current())}`
    navigator.clipboard?.writeText(url).then(
      () => toast.success('Share link copied'),
      () => toast.error('Could not copy link'),
    )
  }

  const onExport = () => {
    const blob = new Blob([presetToJson(current())], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dithrrd-preset.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = (file: File) => {
    file.text().then((text) => {
      try {
        loadPreset(parsePresetJson(text))
        toast.success('Preset loaded')
      } catch {
        toast.error('That file is not a valid preset')
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline">
            Presets <ChevronDown className="ml-1 size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onSave}>Save current</DropdownMenuItem>
        <DropdownMenuItem onClick={onShare}>Share link</DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>Export current</DropdownMenuItem>
        <DropdownMenuItem
          render={
            <label>
              Import…
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Import preset"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) onImport(f)
                }}
              />
            </label>
          }
        />
        {saved.length > 0 && <DropdownMenuSeparator />}
        {saved.length > 0 && (
          <DropdownMenuLabel className="text-xs text-muted-foreground">Saved</DropdownMenuLabel>
        )}
        {saved.map((np) => (
          <DropdownMenuItem
            key={np.id}
            onClick={() => {
              loadPreset(np.preset)
              toast.success(`Loaded ${np.name}`)
            }}
          >
            <span className="flex-1 truncate">{np.name}</span>
            <button
              aria-label={`Delete ${np.name}`}
              className="ml-2 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                deleteNamedPreset(np.id)
                toast.success('Preset deleted')
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

NOTE (base-ui): `DropdownMenuTrigger` uses `render={<Button/>}` (NOT `asChild`), matching `StackPanel.tsx`. The Import item wraps a hidden file `<input>` in a `<label>` via `render={<label>…</label>}`. If a base-ui `DropdownMenuItem` swallows the label's click before the file dialog opens (menu items close the menu on click), fall back to rendering the Import control as a plain `<label>`+hidden input BELOW the dropdown trigger instead of as a menu item — keep the same `aria-label="Import preset"`. Verify against the generated `dropdown-menu.tsx` API and adjust if the click doesn't reach the input; the test only requires the input to exist with that aria-label and to trigger `onImport` on change (add a focused test if you move it).

- [ ] **Step 4: Render PresetMenu in the Toolbar**

In `src/ui/Toolbar.tsx`: add `import { PresetMenu } from '@/ui/PresetMenu'`, and render `<PresetMenu />` inside the right-hand action `div` (between the Open-image label and the Reset button, or right after Reset — place it before "Export PNG"). Do not change Toolbar's existing props/handlers.

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run src/ui/PresetMenu.test.tsx src/ui/Toolbar` (if a Toolbar test exists) and `src/ui/AppShell.test.tsx`
Expected: PASS. If the import-as-menu-item interaction is flaky in the base-ui menu, apply the NOTE's fallback and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/ui/PresetMenu.tsx src/ui/PresetMenu.test.tsx src/ui/Toolbar.tsx
git commit -m "feat: preset menu (save/load/delete/share/import/export)"
```

---

## Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full suite** — Run `pnpm test`. Expected: all pass.
- [ ] **Step 2: Typecheck + build** — Run `pnpm exec tsc -b` (no errors) and `pnpm build` (succeeds).
- [ ] **Step 3: Manual smoke (report it)** — `pnpm dev`, open an image, build a stack (e.g. Duotone with a custom palette + Bayer). Then: **Presets → Save current** (appears under Saved); reset/clear the stack and **load** it back (stack + custom palette restored). **Presets → Share link** (copies a URL); open that URL in a new tab and confirm the exact look rebuilds (stack + custom palette), and the `?p=` param is stripped from the address bar after load. **Export current** downloads a `.json`; **Import…** re-loads it. Reload the page and confirm saved presets persist. No console errors.

---

## Self-Review

**1. Spec coverage** (design spec "Presets (Phase 2): stack + referenced palettes serialize to JSON → save named presets to localStorage, export/import as a file, and encode into a shareable URL … Loading a URL rebuilds the exact look."):
- stack + referenced palettes → JSON: Task 1 (`buildPreset` embeds only referenced custom palettes; `presetToJson`/`parsePresetJson`). ✓
- named presets to localStorage: Task 3. ✓
- export/import as a file: Task 5 (Export current / Import…). ✓
- shareable URL that rebuilds the look: Tasks 2 + 4 + 5 (encode `?p=`, apply on startup, Share link). ✓

**2. Placeholder scan:** No "TBD". Every step ships complete code. Task 5's NOTE gives a concrete fallback for one base-ui interaction risk (import-as-menu-item) with an explicit alternative — not a placeholder.

**3. Type consistency:** `Preset` (`{v, stack: StackNode[], palettes: Palette[]}`) is defined in Task 1 and consumed unchanged by Tasks 2–5. `buildPreset(stack, palettes: Record<string,Palette>)` matches the store's `stack`/`palettes` shapes. `loadPreset(preset: Preset)` (Task 4) is fed by decoded params (Task 2), saved presets (Task 3), and imports (Task 5) — all the same `Preset` type. The persistence subscription added in the palette-editor phase automatically persists palettes merged by `loadPreset`.

**Known simplifications (documented, acceptable):**
- **No compression on the URL param** — the spec says "compressed query param"; this plan uses dependency-free base64url of the JSON instead. Presets are small (a handful of effect nodes with primitive params + a few small palettes), so encoded URLs stay well within browser limits; adding a compressor (e.g. lz-string) is a clean future enhancement that doesn't change the preset schema. This is a deliberate deviation to avoid a runtime dependency.
- Node ids are preserved from the preset rather than regenerated on load (presets replace the whole stack, so local-id collisions can't occur within one session).
- Saving auto-names presets `Preset N` (no rename UI) to keep the menu simple; renaming can be added later. Loading a preset does not restore the source image (presets are looks, not photos) — by design.
- A preset embeds referenced custom palettes by id; if a loaded preset's palette id collides with a different existing custom palette of the same id, the preset's version wins (last-write). Ids are UUIDs, so cross-user collisions are effectively impossible.
