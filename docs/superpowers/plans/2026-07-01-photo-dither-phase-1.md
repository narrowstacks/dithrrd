# Photo Dither Customizer — Phase 1 (Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a usable, fully client-side photo→dithered-art web app: upload a photo, build a reorderable stack of GPU/CPU effects, see a live preview, and export a PNG.

**Architecture:** The app is a render graph. State = a source image + an ordered list of effect nodes. A backend-agnostic engine (`planPasses` + `execute`) walks the stack, running GPU effects as regl shader passes (ping-ponging two framebuffers) and CPU effects (error diffusion) via a Web Worker. The same engine renders the on-screen preview and the off-screen PNG export. React + shadcn/ui render the three-panel editor; controls are auto-generated from each effect's declarative `controls` schema.

**Tech Stack:** pnpm, Vite, React, TypeScript, Tailwind CSS v4, shadcn/ui, regl (WebGL2), Zustand, Vitest + Testing Library, Web Worker.

## Global Constraints

- **Package manager:** pnpm only. Every install/script uses `pnpm` / `pnpm dlx`.
- **Framework:** Vite SPA (NOT Next.js). 100% client-side, deployed to Vercel as static output.
- **Rendering:** WebGL2 via regl. GPU for all effects except error diffusion, which runs on CPU in a Web Worker.
- **Working resolution:** All rendering (preview AND export) happens at a single **working resolution** = source dimensions scaled so the long edge ≤ `MAX_WORKING_EDGE = 4096`, preserving aspect ratio. Preview and export therefore always match. (Export size multipliers are deferred to a later phase.)
- **Effect model:** Each effect is one module exporting a `GpuEffect` or `CpuEffect` object (see Task 3 types). Adding an effect = adding one file + registering it. No bespoke per-effect UI — controls render from the `controls` schema.
- **Palette colors:** stored as `[r, g, b]` floats in `0..1`.
- **UI aesthetic:** Minimal, high-readability. No gradients or decorative flourishes; near-monochrome neutral surface. Color reserved for meaningful accents (active state, primary action) and the photo/palette swatches themselves.
- **Commits:** Conventional Commit messages, one per task (or per green step where noted).
- **Path alias:** `@/` → `src/`.

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, tsconfig.node.json, index.html
vitest.config.ts, vitest.setup.ts
components.json                      # shadcn config
src/
  main.tsx, App.tsx, index.css, vite-env.d.ts
  lib/utils.ts                       # shadcn cn()
  components/ui/*                     # shadcn generated components
  effects/
    types.ts                         # Effect/Control/Palette types
    registry.ts                      # aggregates all effect modules
    grade.ts                         # GPU: pre-process grade
    bayer.ts                         # GPU: ordered dithering
    pixelate.ts                      # GPU: pixelate + posterize
    halftone.ts                      # GPU: circular halftone
    palette.ts                       # GPU: palette mapping
    floydSteinberg.ts                # CPU effect wrapper (uses worker/algorithms)
  color/
    palettes.ts                      # built-in palettes + nearestColor()
  worker/
    algorithms.ts                    # pure error-diffusion functions (tested)
    dither.worker.ts                 # Web Worker entry
    runCpu.ts                        # main-thread client -> worker (RunCpu impl)
  engine/
    quad.ts                          # shared vertex shader + quadCommand()
    planPasses.ts                    # pure: stack -> ordered PassStep[]
    execute.ts                       # async orchestrator over a Backend
    backend.ts                       # Backend interface + reglBackend()
    types.ts                         # engine-facing shared types
  store/
    store.ts                         # Zustand store + actions
  features/
    image.ts                         # decode + downscale to working resolution
    exportPng.ts                     # readback -> canvas -> download
  ui/
    AppShell.tsx                     # three-panel layout + WebGL2 guard
    Toolbar.tsx
    StackPanel.tsx
    ControlsPanel.tsx
    Viewport.tsx
    Control.tsx                      # renders one control from schema
```

---

## Task 1: Project scaffold (Vite + React + TS + Vitest)

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (greenfield).
- Produces: a running Vite app and a passing Vitest setup. `pnpm dev`, `pnpm build`, `pnpm test` all work. Path alias `@/` resolves to `src/`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dithrrd",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "regl": "^2.1.1",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create config files**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>dithrrd</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "vitest.setup.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`.gitignore`:
```
node_modules
dist
*.local
.DS_Store
```

- [ ] **Step 3: Create the app entry**

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`src/index.css`:
```css
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { font-family: system-ui, sans-serif; }
```

`src/App.tsx`:
```tsx
export default function App() {
  return <div>dithrrd</div>
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 4: Write the smoke test**

`src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Install and verify**

Run:
```bash
pnpm install
pnpm test
pnpm build
```
Expected: `pnpm test` prints 1 passing test; `pnpm build` completes with no type errors and emits `dist/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Vitest"
```

---

## Task 2: Tailwind v4 + shadcn/ui

**Files:**
- Modify: `vite.config.ts`, `src/index.css`, `tsconfig.json`
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/*` (generated)
- Test: `src/components/ui/button.test.tsx`

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces: Tailwind working, `cn()` at `@/lib/utils`, and shadcn components installed: `button`, `switch`, `select`, `slider`, `tabs`, `dialog`, `scroll-area`, `resizable`, `tooltip`, `popover`, `separator`, `label`, `input`, `sonner`.

- [ ] **Step 1: Install Tailwind v4**

Run:
```bash
pnpm add tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Wire Tailwind into Vite and CSS**

Edit `vite.config.ts` to add the plugin:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

Replace `src/index.css` with:
```css
@import "tailwindcss";

:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
```

- [ ] **Step 3: Initialize shadcn (non-interactive) and add components**

Run:
```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button switch select slider tabs dialog scroll-area resizable tooltip popover separator label input sonner -y
```
Expected: creates `components.json`, `src/lib/utils.ts`, writes components under `src/components/ui/`, updates `src/index.css` with theme variables, and adds deps (class-variance-authority, clsx, tailwind-merge, lucide-react, etc.).

> If `init -d` reports it cannot detect the alias, ensure `tsconfig.json` has `compilerOptions.paths["@/*"] = ["src/*"]` (it does from Task 1) and re-run. `react-resizable-panels` (used by `resizable`) and `sonner` are installed automatically by the `add` command.

- [ ] **Step 4: Write a component smoke test**

`src/components/ui/button.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Export</Button>)
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run test + build**

Run:
```bash
pnpm test
pnpm build
```
Expected: button test passes; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add Tailwind v4 and shadcn/ui components"
```

---

## Task 3: Core types, palettes, and effect registry infra

**Files:**
- Create: `src/effects/types.ts`, `src/color/palettes.ts`, `src/effects/registry.ts`
- Test: `src/color/palettes.test.ts`, `src/effects/registry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - Types: `Family`, `Control`, `Params`, `ParamValue`, `Palette`, `EffectContext`, `GpuEffect`, `CpuEffect`, `Effect`.
  - `PALETTES: Record<string, Palette>` and `nearestColor(rgb, palette): [number,number,number]`.
  - `registry: Record<string, Effect>` and `EFFECT_LIST: Effect[]` (empty aggregations initially; effect tasks append).

- [ ] **Step 1: Write the types**

`src/effects/types.ts`:
```ts
export type Family = 'color' | 'ordered' | 'diffusion' | 'halftone' | 'pixelate'

export interface SliderControl { type: 'slider'; key: string; label: string; min: number; max: number; step: number }
export interface SelectControl { type: 'select'; key: string; label: string; options: { label: string; value: string }[] }
export interface ToggleControl { type: 'toggle'; key: string; label: string }
export interface PaletteControl { type: 'palette'; key: string; label: string }
export interface AngleControl { type: 'angle'; key: string; label: string }
export type Control = SliderControl | SelectControl | ToggleControl | PaletteControl | AngleControl

export type ParamValue = number | string | boolean
export type Params = Record<string, ParamValue>

export interface Palette {
  id: string
  name: string
  colors: [number, number, number][] // 0..1
}

export interface EffectContext {
  palettes: Record<string, Palette>
}

interface BaseEffect {
  type: string
  name: string
  family: Family
  defaultParams: Params
  controls: Control[]
}

export interface GpuEffect extends BaseEffect {
  kind: 'gpu'
  frag: string
  /** Names of the effect-specific uniforms (src + resolution are always provided by the backend). */
  uniformKeys: string[]
  /** Pure map from params -> uniform values. Keys MUST match uniformKeys. */
  uniforms(params: Params, ctx: EffectContext): Record<string, unknown>
}

export interface CpuEffect extends BaseEffect {
  kind: 'cpu'
  /** Mutates the RGBA buffer in place. Must be a pure function of its inputs. */
  process(buf: Uint8ClampedArray, width: number, height: number, params: Params): void
}

export type Effect = GpuEffect | CpuEffect
```

- [ ] **Step 2: Write the failing palette test**

`src/color/palettes.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PALETTES, nearestColor } from '@/color/palettes'

describe('PALETTES', () => {
  it('includes bw, gray4, and gameboy with valid 0..1 colors', () => {
    for (const id of ['bw', 'gray4', 'gameboy']) {
      const p = PALETTES[id]
      expect(p, id).toBeTruthy()
      expect(p.colors.length).toBeGreaterThan(0)
      for (const c of p.colors) {
        expect(c).toHaveLength(3)
        for (const v of c) expect(v >= 0 && v <= 1).toBe(true)
      }
    }
  })
})

describe('nearestColor', () => {
  const p = { id: 't', name: 't', colors: [[0, 0, 0], [1, 1, 1]] as [number, number, number][] }
  it('snaps a dark color to black', () => {
    expect(nearestColor([0.1, 0.1, 0.1], p)).toEqual([0, 0, 0])
  })
  it('snaps a light color to white', () => {
    expect(nearestColor([0.9, 0.9, 0.9], p)).toEqual([1, 1, 1])
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test src/color/palettes.test.ts`
Expected: FAIL — cannot find module `@/color/palettes`.

- [ ] **Step 4: Implement palettes**

`src/color/palettes.ts`:
```ts
import type { Palette } from '@/effects/types'

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(0, 2), 16) / 255,
  parseInt(h.slice(2, 4), 16) / 255,
  parseInt(h.slice(4, 6), 16) / 255,
]

export const PALETTES: Record<string, Palette> = {
  bw: { id: 'bw', name: 'Black & White', colors: [[0, 0, 0], [1, 1, 1]] },
  gray4: {
    id: 'gray4',
    name: 'Grayscale 4',
    colors: [[0, 0, 0], [0.333, 0.333, 0.333], [0.667, 0.667, 0.667], [1, 1, 1]],
  },
  gameboy: {
    id: 'gameboy',
    name: 'Game Boy',
    colors: [hex('0f380f'), hex('306230'), hex('8bac0f'), hex('9bbc0f')],
  },
}

export function nearestColor(
  rgb: [number, number, number],
  palette: Palette,
): [number, number, number] {
  let best = Infinity
  let pick = palette.colors[0]
  for (const c of palette.colors) {
    const dr = rgb[0] - c[0]
    const dg = rgb[1] - c[1]
    const db = rgb[2] - c[2]
    const d = dr * dr + dg * dg + db * db
    if (d < best) {
      best = d
      pick = c
    }
  }
  return [pick[0], pick[1], pick[2]]
}
```

- [ ] **Step 5: Run palette test to verify pass**

Run: `pnpm test src/color/palettes.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the registry with an integrity test**

`src/effects/registry.ts`:
```ts
import type { Effect } from '@/effects/types'

// Effect modules are appended here as they are implemented (Tasks 4, 6-10).
export const EFFECT_LIST: Effect[] = []

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
```

`src/effects/registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { EFFECT_LIST, registry } from '@/effects/registry'

describe('registry integrity', () => {
  it('has a unique type per effect', () => {
    const types = EFFECT_LIST.map((e) => e.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('every effect default param has a matching control key', () => {
    for (const e of EFFECT_LIST) {
      const controlKeys = new Set(e.controls.map((c) => c.key))
      for (const key of Object.keys(e.defaultParams)) {
        expect(controlKeys.has(key), `${e.type}.${key}`).toBe(true)
      }
    }
  })

  it('registry maps type -> effect', () => {
    for (const e of EFFECT_LIST) expect(registry[e.type]).toBe(e)
  })
})
```

- [ ] **Step 7: Run all tests**

Run: `pnpm test`
Expected: PASS (registry test passes trivially with the empty list; effect tasks will populate it).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add effect types, built-in palettes, and registry infra"
```

---

## Task 4: CPU error-diffusion algorithm + worker + Floyd–Steinberg effect

**Files:**
- Create: `src/worker/algorithms.ts`, `src/worker/dither.worker.ts`, `src/worker/runCpu.ts`, `src/effects/floydSteinberg.ts`
- Modify: `src/effects/registry.ts`
- Test: `src/worker/algorithms.test.ts`

**Interfaces:**
- Consumes: types from Task 3.
- Produces:
  - `floydSteinberg(buf: Uint8ClampedArray, width: number, height: number, params: { levels: number; serpentine: boolean }): void` (in-place).
  - `RunCpu` type: `(type: string, buf: Uint8ClampedArray, width: number, height: number, params: Params) => Promise<Uint8ClampedArray>`.
  - `createRunCpu(): { runCpu: RunCpu; dispose(): void }` — worker-backed client.
  - Registers the `floyd` CpuEffect into `EFFECT_LIST`.

- [ ] **Step 1: Write the failing algorithm test**

`src/worker/algorithms.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { floydSteinberg } from '@/worker/algorithms'

function gray(v: number): Uint8ClampedArray {
  return new Uint8ClampedArray([v, v, v, 255])
}

describe('floydSteinberg', () => {
  it('snaps a single mid-gray pixel to black or white at 2 levels', () => {
    const buf = gray(100)
    floydSteinberg(buf, 1, 1, { levels: 2, serpentine: false })
    expect([0, 255]).toContain(buf[0])
    expect(buf[0]).toBe(buf[1])
    expect(buf[1]).toBe(buf[2])
    expect(buf[3]).toBe(255) // alpha untouched
  })

  it('leaves pure black and pure white unchanged at 2 levels', () => {
    const black = gray(0)
    floydSteinberg(black, 1, 1, { levels: 2, serpentine: false })
    expect(black[0]).toBe(0)
    const white = gray(255)
    floydSteinberg(white, 1, 1, { levels: 2, serpentine: false })
    expect(white[0]).toBe(255)
  })

  it('diffuses error to the neighbor to the right', () => {
    // Two gray pixels just below the 127.5 rounding midpoint. The first rounds
    // to 0 (err +127 -> mostly right), pushing the right pixel brighter so it
    // rounds to 255. (127 not 128: 128/255 rounds UP to white, which would invert this.)
    const buf = new Uint8ClampedArray([127, 127, 127, 255, 127, 127, 127, 255])
    floydSteinberg(buf, 2, 1, { levels: 2, serpentine: false })
    expect(buf[0]).toBe(0)
    expect(buf[4]).toBe(255)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/worker/algorithms.test.ts`
Expected: FAIL — cannot find module `@/worker/algorithms`.

- [ ] **Step 3: Implement the algorithm**

`src/worker/algorithms.ts`:
```ts
function quantize(value: number, levels: number): number {
  const L = Math.max(2, Math.floor(levels))
  const step = 255 / (L - 1)
  return Math.round(Math.round(value / step) * step)
}

export function floydSteinberg(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  params: { levels: number; serpentine: boolean },
): void {
  const { levels, serpentine } = params
  // Work in a Float array to accumulate error beyond 0..255 clamping.
  const f = new Float32Array(width * height * 3)
  for (let p = 0; p < width * height; p++) {
    for (let c = 0; c < 3; c++) f[p * 3 + c] = buf[p * 4 + c]
  }

  const add = (x: number, y: number, c: number, err: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    f[(y * width + x) * 3 + c] += err
  }

  for (let y = 0; y < height; y++) {
    const ltr = !serpentine || y % 2 === 0
    for (let i = 0; i < width; i++) {
      const x = ltr ? i : width - 1 - i
      const dir = ltr ? 1 : -1
      for (let c = 0; c < 3; c++) {
        const old = f[(y * width + x) * 3 + c]
        const nw = quantize(old, levels)
        const err = old - nw
        f[(y * width + x) * 3 + c] = nw
        add(x + dir, y, c, (err * 7) / 16)
        add(x - dir, y + 1, c, (err * 3) / 16)
        add(x, y + 1, c, (err * 5) / 16)
        add(x + dir, y + 1, c, (err * 1) / 16)
      }
    }
  }

  for (let p = 0; p < width * height; p++) {
    for (let c = 0; c < 3; c++) buf[p * 4 + c] = f[p * 3 + c]
    // alpha (index 3) left untouched
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/worker/algorithms.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the worker and its client (no automated test — integration verified via the app)**

`src/worker/dither.worker.ts`:
```ts
import { floydSteinberg } from './algorithms'
import type { Params } from '@/effects/types'

interface Req { id: number; type: string; buf: ArrayBuffer; width: number; height: number; params: Params }

const handlers: Record<string, (buf: Uint8ClampedArray, w: number, h: number, p: Params) => void> = {
  floyd: (buf, w, h, p) =>
    floydSteinberg(buf, w, h, { levels: Number(p.levels), serpentine: Boolean(p.serpentine) }),
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, type, buf, width, height, params } = e.data
  const pixels = new Uint8ClampedArray(buf)
  handlers[type]?.(pixels, width, height, params)
  ;(self as unknown as Worker).postMessage({ id, buf: pixels.buffer }, [pixels.buffer])
}
```

`src/worker/runCpu.ts`:
```ts
import type { Params } from '@/effects/types'

export type RunCpu = (
  type: string,
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  params: Params,
) => Promise<Uint8ClampedArray>

export function createRunCpu(): { runCpu: RunCpu; dispose: () => void } {
  const worker = new Worker(new URL('./dither.worker.ts', import.meta.url), { type: 'module' })
  let nextId = 1
  const pending = new Map<
    number,
    { resolve: (b: Uint8ClampedArray) => void; reject: (e: unknown) => void }
  >()

  worker.onmessage = (e: MessageEvent<{ id: number; buf: ArrayBuffer }>) => {
    const entry = pending.get(e.data.id)
    if (entry) {
      pending.delete(e.data.id)
      entry.resolve(new Uint8ClampedArray(e.data.buf))
    }
  }

  // Reject every in-flight request rather than hanging forever on a worker crash.
  worker.onerror = (e) => {
    const err = new Error(`dither worker error: ${e.message}`)
    for (const { reject } of pending.values()) reject(err)
    pending.clear()
  }

  const runCpu: RunCpu = (type, buf, width, height, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      // Copy so the caller's buffer isn't detached by transfer.
      const copy = buf.slice()
      worker.postMessage({ id, type, buf: copy.buffer, width, height, params }, [copy.buffer])
    })

  return {
    runCpu,
    dispose: () => {
      const err = new Error('dither worker disposed')
      for (const { reject } of pending.values()) reject(err)
      pending.clear()
      worker.terminate()
    },
  }
}
```

- [ ] **Step 6: Register the Floyd–Steinberg effect**

`src/effects/floydSteinberg.ts`:
```ts
import type { CpuEffect } from '@/effects/types'
import { floydSteinberg as fs } from '@/worker/algorithms'

export const floyd: CpuEffect = {
  kind: 'cpu',
  type: 'floyd',
  name: 'Floyd–Steinberg',
  family: 'diffusion',
  defaultParams: { levels: 2, serpentine: true },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'toggle', key: 'serpentine', label: 'Serpentine' },
  ],
  process: (buf, w, h, params) =>
    fs(buf, w, h, { levels: Number(params.levels), serpentine: Boolean(params.serpentine) }),
}
```

Edit `src/effects/registry.ts`:
```ts
import type { Effect } from '@/effects/types'
import { floyd } from '@/effects/floydSteinberg'

export const EFFECT_LIST: Effect[] = [floyd]

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
```

- [ ] **Step 7: Run all tests + build**

Run:
```bash
pnpm test
pnpm build
```
Expected: PASS; build succeeds (worker compiles).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add CPU error diffusion, worker client, and Floyd-Steinberg effect"
```

---

## Task 5: Engine — planPasses, execute, and regl backend

**Files:**
- Create: `src/engine/quad.ts`, `src/engine/planPasses.ts`, `src/engine/execute.ts`, `src/engine/backend.ts`
- Test: `src/engine/planPasses.test.ts`, `src/engine/execute.test.ts`

**Interfaces:**
- Consumes: `Effect`, `Params`, `Palette` (Task 3); `registry` (Task 3); `RunCpu` (Task 4).
- Produces:
  - `interface StackNode { id: string; type: string; enabled: boolean; params: Params }`.
  - `interface PassStep { node: StackNode; effect: Effect }`.
  - `planPasses(stack: StackNode[], reg: Record<string, Effect>): PassStep[]`.
  - `interface Backend` (methods below) and `interface TexHandle`, `interface FboHandle`.
  - `execute(steps: PassStep[], backend: Backend, opts: { runCpu: RunCpu; palettes: Record<string, Palette> }): Promise<TexHandle>` — runs the stack and RETURNS the final texture handle. It does NOT present; the caller decides to `backend.present(tex)` (preview) or `backend.readback(tex)` (export). This single loop is shared by both preview and export — no duplication.
  - `createReglBackend(canvas: HTMLCanvasElement, source: ImageData, width, height): Backend & { dispose(): void }`.
  - `QUAD_VERT: string`, `quadCommand(regl, frag, uniformKeys)`.

- [ ] **Step 1: Write the failing planPasses test**

`src/engine/planPasses.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { planPasses } from '@/engine/planPasses'
import type { Effect } from '@/effects/types'

const fakeReg: Record<string, Effect> = {
  a: { kind: 'gpu', type: 'a', name: 'A', family: 'ordered', defaultParams: {}, controls: [], frag: '', uniformKeys: [], uniforms: () => ({}) },
  b: { kind: 'gpu', type: 'b', name: 'B', family: 'ordered', defaultParams: {}, controls: [], frag: '', uniformKeys: [], uniforms: () => ({}) },
}

describe('planPasses', () => {
  it('keeps enabled nodes in order and resolves effects', () => {
    const steps = planPasses(
      [
        { id: '1', type: 'a', enabled: true, params: {} },
        { id: '2', type: 'b', enabled: true, params: {} },
      ],
      fakeReg,
    )
    expect(steps.map((s) => s.node.id)).toEqual(['1', '2'])
    expect(steps[0].effect).toBe(fakeReg.a)
  })

  it('drops disabled nodes', () => {
    const steps = planPasses([{ id: '1', type: 'a', enabled: false, params: {} }], fakeReg)
    expect(steps).toHaveLength(0)
  })

  it('drops nodes whose type is not in the registry', () => {
    const steps = planPasses([{ id: '1', type: 'zzz', enabled: true, params: {} }], fakeReg)
    expect(steps).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/engine/planPasses.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement types + planPasses**

`src/engine/planPasses.ts`:
```ts
import type { Effect, Params } from '@/effects/types'

export interface StackNode {
  id: string
  type: string
  enabled: boolean
  params: Params
}

export interface PassStep {
  node: StackNode
  effect: Effect
}

export function planPasses(
  stack: StackNode[],
  reg: Record<string, Effect>,
): PassStep[] {
  const steps: PassStep[] = []
  for (const node of stack) {
    if (!node.enabled) continue
    const effect = reg[node.type]
    if (!effect) continue
    steps.push({ node, effect })
  }
  return steps
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/engine/planPasses.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing execute test (fake backend)**

`src/engine/execute.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { execute } from '@/engine/execute'
import type { Backend, TexHandle, FboHandle } from '@/engine/backend'
import type { PassStep } from '@/engine/planPasses'
import type { Effect } from '@/effects/types'

const gpu = (type: string): Effect => ({
  kind: 'gpu', type, name: type, family: 'ordered', defaultParams: {}, controls: [],
  frag: '', uniformKeys: [], uniforms: () => ({}),
})
const cpu = (type: string): Effect => ({
  kind: 'cpu', type, name: type, family: 'diffusion', defaultParams: {}, controls: [],
  process: () => {},
})

function fakeBackend() {
  const log: string[] = []
  const src = { __tex: 'src' } as unknown as TexHandle
  const ping = { __fbo: 'ping', tex: { __tex: 'ping' } as unknown as TexHandle } as unknown as FboHandle
  const pong = { __fbo: 'pong', tex: { __tex: 'pong' } as unknown as TexHandle } as unknown as FboHandle
  const fbos = [ping, pong]
  let acquired = 0
  const backend: Backend = {
    size: () => [4, 4],
    sourceTexture: () => src,
    acquireFbo: () => fbos[acquired++ % 2],
    drawEffect: (effect, args) => log.push(`draw:${effect.type}->${(args.targetFbo as any).__fbo}`),
    fboTexture: (fbo) => (fbo as any).tex,
    readback: () => ({ data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }),
    uploadPixels: () => ({ __tex: 'uploaded' } as unknown as TexHandle),
    present: (tex) => log.push(`present:${(tex as any).__tex}`),
  }
  return { backend, log }
}

describe('execute', () => {
  it('ping-pongs GPU passes and returns the final texture (without presenting)', async () => {
    const steps: PassStep[] = [
      { node: { id: '1', type: 'a', enabled: true, params: {} }, effect: gpu('a') },
      { node: { id: '2', type: 'b', enabled: true, params: {} }, effect: gpu('b') },
    ]
    const { backend, log } = fakeBackend()
    const final = await execute(steps, backend, { runCpu: async (_t, b) => b, palettes: {} })
    expect(log).toEqual(['draw:a->ping', 'draw:b->pong'])
    expect((final as unknown as { __tex: string }).__tex).toBe('pong')
  })

  it('routes CPU effects through readback + runCpu + uploadPixels', async () => {
    const steps: PassStep[] = [
      { node: { id: '1', type: 'a', enabled: true, params: {} }, effect: gpu('a') },
      { node: { id: '2', type: 'f', enabled: true, params: { levels: 2 } }, effect: cpu('f') },
    ]
    const { backend, log } = fakeBackend()
    const runCpu = vi.fn(async (_t: string, b: Uint8ClampedArray) => b)
    const final = await execute(steps, backend, { runCpu, palettes: {} })
    expect(runCpu).toHaveBeenCalledOnce()
    expect(log).toEqual(['draw:a->ping'])
    expect((final as unknown as { __tex: string }).__tex).toBe('uploaded')
  })

  it('returns the source texture untouched when the stack is empty', async () => {
    const { backend, log } = fakeBackend()
    const final = await execute([], backend, { runCpu: async (_t, b) => b, palettes: {} })
    expect(log).toEqual([])
    expect((final as unknown as { __tex: string }).__tex).toBe('src')
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm test src/engine/execute.test.ts`
Expected: FAIL — cannot find `@/engine/execute` / `@/engine/backend`.

- [ ] **Step 7: Implement the Backend interface + execute**

`src/engine/backend.ts` (interface portion first — the regl implementation is added in Step 9):
```ts
import type { Effect, Palette, Params } from '@/effects/types'

export interface TexHandle { readonly _tex?: never }
export interface FboHandle { readonly _fbo?: never; tex: TexHandle }

export interface DrawArgs {
  srcTex: TexHandle
  targetFbo: FboHandle
  params: Params
  resolution: [number, number]
  palettes: Record<string, Palette>
}

export interface Backend {
  size(): [number, number]
  sourceTexture(): TexHandle
  acquireFbo(): FboHandle
  drawEffect(effect: Effect, args: DrawArgs): void
  fboTexture(fbo: FboHandle): TexHandle
  readback(tex: TexHandle): { data: Uint8ClampedArray; width: number; height: number }
  uploadPixels(data: Uint8ClampedArray, width: number, height: number): TexHandle
  present(tex: TexHandle): void
}
```

`src/engine/execute.ts`:
```ts
import type { Backend } from '@/engine/backend'
import type { PassStep } from '@/engine/planPasses'
import type { Palette } from '@/effects/types'
import type { RunCpu } from '@/worker/runCpu'
import type { TexHandle } from '@/engine/backend'

export async function execute(
  steps: PassStep[],
  backend: Backend,
  opts: { runCpu: RunCpu; palettes: Record<string, Palette> },
): Promise<TexHandle> {
  let current = backend.sourceTexture()
  const ping = backend.acquireFbo()
  const pong = backend.acquireFbo()
  let target = ping

  for (const step of steps) {
    if (step.effect.kind === 'cpu') {
      const { data, width, height } = backend.readback(current)
      const out = await opts.runCpu(step.effect.type, data, width, height, step.node.params)
      current = backend.uploadPixels(out, width, height)
    } else {
      backend.drawEffect(step.effect, {
        srcTex: current,
        targetFbo: target,
        params: step.node.params,
        resolution: backend.size(),
        palettes: opts.palettes,
      })
      current = backend.fboTexture(target)
      target = target === ping ? pong : ping
    }
  }

  // Does NOT present. Caller presents (preview) or reads back (export).
  return current
}
```

- [ ] **Step 8: Run to verify execute passes**

Run: `pnpm test src/engine/execute.test.ts`
Expected: PASS.

- [ ] **Step 9: Add the shared quad + regl backend (manual verification — no GPU in Vitest)**

`src/engine/quad.ts`:
```ts
import type { Regl, DrawCommand } from 'regl'

export const QUAD_VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = 0.5 * (position + 1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}`

const cache = new WeakMap<Regl, Map<string, DrawCommand>>()

export function quadCommand(regl: Regl, frag: string, uniformKeys: string[]): DrawCommand {
  let byFrag = cache.get(regl)
  if (!byFrag) {
    byFrag = new Map()
    cache.set(regl, byFrag)
  }
  let cmd = byFrag.get(frag)
  if (!cmd) {
    const uniforms: Record<string, unknown> = {
      src: regl.prop('src' as never),
      resolution: regl.prop('resolution' as never),
    }
    for (const k of uniformKeys) uniforms[k] = regl.prop(k as never)
    cmd = regl({
      vert: QUAD_VERT,
      frag,
      attributes: { position: [[-1, -1], [3, -1], [-1, 3]] },
      uniforms,
      count: 3,
      framebuffer: regl.prop('framebuffer' as never),
    })
    byFrag.set(frag, cmd)
  }
  return cmd
}
```

Append the regl backend to `src/engine/backend.ts`:
```ts
import createREGL from 'regl'
import type { Regl, Framebuffer2D, Texture2D } from 'regl'
import { quadCommand } from '@/engine/quad'

export function createReglBackend(
  canvas: HTMLCanvasElement,
  source: ImageData,
  width: number,
  height: number,
): Backend & { dispose(): void } {
  // Must obtain a WebGL2 context explicitly: regl, given only `canvas`, requests
  // `webgl`/`experimental-webgl` (WebGL1), which cannot compile our `#version 300 es`
  // shaders. Create the webgl2 context and pass it as `gl` (regl uses a supplied gl
  // verbatim and then ignores the `attributes` option — so preserveDrawingBuffer must
  // go on getContext).
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
  if (!gl) throw new Error('WebGL2 not supported')
  const regl: Regl = createREGL({ gl: gl as unknown as WebGLRenderingContext, extensions: [] })

  const sourceTex = regl.texture({ data: source, flipY: true, min: 'linear', mag: 'linear' })

  const makeFbo = () =>
    regl.framebuffer({
      color: regl.texture({ width, height, min: 'nearest', mag: 'nearest' }),
      depth: false,
    })
  const pool = [makeFbo(), makeFbo()]
  let acquired = 0
  // The texture produced by the most recent CPU step (uploadPixels). Destroyed when the
  // next upload replaces it, so repeated renders with CPU effects don't leak GPU textures.
  // The current one stays alive through present/readback; regl.destroy() frees the last.
  let lastUploaded: Texture2D | null = null

  const wrapTex = (t: Texture2D): TexHandle => ({ t } as unknown as TexHandle)
  const wrapFbo = (fb: Framebuffer2D, tex: TexHandle): FboHandle =>
    ({ fb, tex } as unknown as FboHandle)
  const rawTex = (h: TexHandle) => (h as unknown as { t: Texture2D }).t
  const rawFbo = (h: FboHandle) => (h as unknown as { fb: Framebuffer2D }).fb

  // Command to blit a texture to the screen (default framebuffer).
  const present = quadCommand(regl, `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
void main() { fragColor = texture(src, vUv); }`, [])

  return {
    size: () => [width, height],
    sourceTexture: () => wrapTex(sourceTex),
    acquireFbo: () => {
      const fb = pool[acquired++ % 2]
      return wrapFbo(fb, wrapTex(fb.color[0] as Texture2D))
    },
    drawEffect: (effect, args) => {
      if (effect.kind !== 'gpu') return
      const cmd = quadCommand(regl, effect.frag, effect.uniformKeys)
      cmd({
        framebuffer: rawFbo(args.targetFbo),
        src: rawTex(args.srcTex),
        resolution: args.resolution,
        ...effect.uniforms(args.params, { palettes: args.palettes }),
      })
    },
    fboTexture: (fbo) => (fbo as unknown as { tex: TexHandle }).tex,
    readback: (tex) => {
      // Wrap ANY texture (pool fbo texture, uploadPixels result, or source) in a
      // temporary framebuffer and read it. This works regardless of whether the
      // texture came from the ping/pong pool — critical for exporting a stack whose
      // final effect is CPU (e.g. Floyd–Steinberg), whose result is an uploadPixels
      // texture that is not in the pool.
      const fb = regl.framebuffer({ color: rawTex(tex), depth: false })
      const data = regl.read({ framebuffer: fb }) as Uint8Array
      const out = new Uint8ClampedArray(data)
      fb.destroy()
      return { data: out, width, height }
    },
    uploadPixels: (data, w, h) => {
      lastUploaded?.destroy()
      lastUploaded = regl.texture({ data, width: w, height: h, min: 'nearest', mag: 'nearest' })
      return wrapTex(lastUploaded)
    },
    present: (tex) => {
      regl.clear({ color: [0, 0, 0, 0], depth: 1 })
      present({ framebuffer: null, src: rawTex(tex), resolution: [width, height] })
    },
    dispose: () => regl.destroy(),
  }
}
```

> Manual verification for the regl backend happens end-to-end in Task 13 (viewport). There is no headless WebGL2 in Vitest, so `createReglBackend` is intentionally excluded from unit tests; the orchestration it serves (`execute`) is fully covered with a fake backend above. `readback` wraps whatever texture it is given in a throwaway framebuffer, so it reads the correct pixels for GPU fbo textures, `uploadPixels` results (CPU output), and the source texture alike — including CPU-first stacks and stacks ending in a CPU effect.

- [ ] **Step 10: Run all tests + build**

Run:
```bash
pnpm test
pnpm build
```
Expected: PASS; build succeeds (regl types resolve).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add render engine (planPasses, execute, regl backend)"
```

---

## Task 6: GPU effect — Pre-process Grade

**Files:**
- Create: `src/effects/grade.ts`
- Modify: `src/effects/registry.ts`
- Test: `src/effects/grade.test.ts`

**Interfaces:**
- Consumes: `GpuEffect`, `Params` (Task 3).
- Produces: `grade: GpuEffect` with `type: 'grade'`, registered first in `EFFECT_LIST`. `uniforms()` returns `{ uBrightness, uContrast, uGamma, uSaturation }`.

- [ ] **Step 1: Write the failing test**

`src/effects/grade.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { grade } from '@/effects/grade'

describe('grade effect', () => {
  it('maps params to the declared uniform keys', () => {
    const u = grade.uniforms(grade.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...grade.uniformKeys].sort())
  })
  it('passes numeric params straight through', () => {
    const u = grade.uniforms({ brightness: 0.2, contrast: 1.1, gamma: 0.9, saturation: 1.5 }, { palettes: {} })
    expect(u).toMatchObject({ uBrightness: 0.2, uContrast: 1.1, uGamma: 0.9, uSaturation: 1.5 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/effects/grade.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the effect**

`src/effects/grade.ts`:
```ts
import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uBrightness; uniform float uContrast; uniform float uGamma; uniform float uSaturation;
void main() {
  vec3 c = texture(src, vUv).rgb;
  c += uBrightness;
  c = (c - 0.5) * uContrast + 0.5;
  c = clamp(c, 0.0, 1.0);
  c = pow(c, vec3(1.0 / max(uGamma, 0.001)));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

export const grade: GpuEffect = {
  kind: 'gpu',
  type: 'grade',
  name: 'Grade',
  family: 'color',
  defaultParams: { brightness: 0, contrast: 1, gamma: 1, saturation: 1 },
  controls: [
    { type: 'slider', key: 'brightness', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01 },
    { type: 'slider', key: 'contrast', label: 'Contrast', min: 0, max: 2, step: 0.01 },
    { type: 'slider', key: 'gamma', label: 'Gamma', min: 0.2, max: 3, step: 0.01 },
    { type: 'slider', key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01 },
  ],
  frag: FRAG,
  uniformKeys: ['uBrightness', 'uContrast', 'uGamma', 'uSaturation'],
  uniforms: (p) => ({
    uBrightness: Number(p.brightness),
    uContrast: Number(p.contrast),
    uGamma: Number(p.gamma),
    uSaturation: Number(p.saturation),
  }),
}
```

Edit `src/effects/registry.ts` to import and prepend `grade`:
```ts
import type { Effect } from '@/effects/types'
import { grade } from '@/effects/grade'
import { floyd } from '@/effects/floydSteinberg'

export const EFFECT_LIST: Effect[] = [grade, floyd]

export const registry: Record<string, Effect> = Object.fromEntries(
  EFFECT_LIST.map((e) => [e.type, e]),
)
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/effects/grade.test.ts src/effects/registry.test.ts`
Expected: PASS (grade uniforms test + registry integrity both green).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pre-process grade effect"
```

---

## Task 7: GPU effect — Bayer ordered dithering

**Files:**
- Create: `src/effects/bayer.ts`
- Modify: `src/effects/registry.ts`
- Test: `src/effects/bayer.test.ts`

**Interfaces:**
- Consumes: `GpuEffect` (Task 3).
- Produces: `bayer: GpuEffect`, `type: 'bayer'`. `uniforms()` returns `{ uLevels, uMatrix }` where `uMatrix` ∈ {4, 8} from the `matrix` select.

- [ ] **Step 1: Write the failing test**

`src/effects/bayer.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { bayer } from '@/effects/bayer'

describe('bayer effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = bayer.uniforms(bayer.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...bayer.uniformKeys].sort())
  })
  it("converts the matrix select ('4'/'8') to a numeric uniform", () => {
    expect(bayer.uniforms({ matrix: '4', levels: 2 }, { palettes: {} })).toMatchObject({ uMatrix: 4 })
    expect(bayer.uniforms({ matrix: '8', levels: 2 }, { palettes: {} })).toMatchObject({ uMatrix: 8 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/effects/bayer.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the effect**

`src/effects/bayer.ts`:
```ts
import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uLevels; uniform float uMatrix;

const float BAYER4[16] = float[16](
  0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
const float BAYER8[64] = float[64](
  0.,32.,8.,40.,2.,34.,10.,42., 48.,16.,56.,24.,50.,18.,58.,26.,
  12.,44.,4.,36.,14.,46.,6.,38., 60.,28.,52.,20.,62.,30.,54.,22.,
  3.,35.,11.,43.,1.,33.,9.,41., 51.,19.,59.,27.,49.,17.,57.,25.,
  15.,47.,7.,39.,13.,45.,5.,37., 63.,31.,55.,23.,61.,29.,53.,21.);

float threshold(ivec2 p) {
  if (uMatrix > 7.0) {
    int x = int(mod(float(p.x), 8.0)); int y = int(mod(float(p.y), 8.0));
    return BAYER8[y * 8 + x] / 64.0 - 0.5;
  }
  int x = int(mod(float(p.x), 4.0)); int y = int(mod(float(p.y), 4.0));
  return BAYER4[y * 4 + x] / 16.0 - 0.5;
}

void main() {
  ivec2 pix = ivec2(vUv * resolution);
  float t = threshold(pix);
  float L = max(uLevels, 2.0);
  vec3 c = texture(src, vUv).rgb;
  c = clamp(c + t / (L - 1.0), 0.0, 1.0);
  c = floor(c * (L - 1.0) + 0.5) / (L - 1.0);
  fragColor = vec4(c, 1.0);
}`

export const bayer: GpuEffect = {
  kind: 'gpu',
  type: 'bayer',
  name: 'Bayer Dither',
  family: 'ordered',
  defaultParams: { matrix: '4', levels: 2 },
  controls: [
    { type: 'select', key: 'matrix', label: 'Matrix', options: [
      { label: '4 × 4', value: '4' }, { label: '8 × 8', value: '8' },
    ] },
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
  ],
  frag: FRAG,
  uniformKeys: ['uLevels', 'uMatrix'],
  uniforms: (p) => ({
    uLevels: Number(p.levels),
    uMatrix: p.matrix === '8' ? 8 : 4,
  }),
}
```

Edit `src/effects/registry.ts` — add `bayer` after `grade`:
```ts
import { grade } from '@/effects/grade'
import { bayer } from '@/effects/bayer'
import { floyd } from '@/effects/floydSteinberg'
// ...
export const EFFECT_LIST: Effect[] = [grade, bayer, floyd]
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/effects/bayer.test.ts src/effects/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Bayer ordered dithering effect"
```

---

## Task 8: GPU effect — Pixelate + Posterize

**Files:**
- Create: `src/effects/pixelate.ts`
- Modify: `src/effects/registry.ts`
- Test: `src/effects/pixelate.test.ts`

**Interfaces:**
- Consumes: `GpuEffect` (Task 3).
- Produces: `pixelate: GpuEffect`, `type: 'pixelate'`. `uniforms()` returns `{ uPixelSize, uLevels }`.

- [ ] **Step 1: Write the failing test**

`src/effects/pixelate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pixelate } from '@/effects/pixelate'

describe('pixelate effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = pixelate.uniforms(pixelate.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...pixelate.uniformKeys].sort())
  })
  it('passes pixel size and levels through', () => {
    expect(pixelate.uniforms({ pixelSize: 6, levels: 4 }, { palettes: {} }))
      .toMatchObject({ uPixelSize: 6, uLevels: 4 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/effects/pixelate.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the effect**

`src/effects/pixelate.ts`:
```ts
import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uPixelSize; uniform float uLevels;
void main() {
  float ps = max(uPixelSize, 1.0);
  vec2 cell = ps / resolution;
  vec2 uv = (floor(vUv / cell) + 0.5) * cell;
  vec3 c = texture(src, uv).rgb;
  float L = max(uLevels, 2.0);
  c = floor(c * (L - 1.0) + 0.5) / (L - 1.0);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

export const pixelate: GpuEffect = {
  kind: 'gpu',
  type: 'pixelate',
  name: 'Pixelate + Posterize',
  family: 'pixelate',
  defaultParams: { pixelSize: 4, levels: 4 },
  controls: [
    { type: 'slider', key: 'pixelSize', label: 'Pixel Size', min: 1, max: 64, step: 1 },
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 16, step: 1 },
  ],
  frag: FRAG,
  uniformKeys: ['uPixelSize', 'uLevels'],
  uniforms: (p) => ({ uPixelSize: Number(p.pixelSize), uLevels: Number(p.levels) }),
}
```

Edit `src/effects/registry.ts` — add `pixelate` after `grade` (before `bayer` reads naturally as: grade, pixelate, bayer, floyd):
```ts
import { grade } from '@/effects/grade'
import { pixelate } from '@/effects/pixelate'
import { bayer } from '@/effects/bayer'
import { floyd } from '@/effects/floydSteinberg'
// ...
export const EFFECT_LIST: Effect[] = [grade, pixelate, bayer, floyd]
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/effects/pixelate.test.ts src/effects/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pixelate + posterize effect"
```

---

## Task 9: GPU effect — Circular Halftone

**Files:**
- Create: `src/effects/halftone.ts`
- Modify: `src/effects/registry.ts`
- Test: `src/effects/halftone.test.ts`

**Interfaces:**
- Consumes: `GpuEffect` (Task 3).
- Produces: `halftone: GpuEffect`, `type: 'halftone'`. `uniforms()` returns `{ uCellSize, uAngle }` where `uAngle` is `angle` degrees converted to radians.

- [ ] **Step 1: Write the failing test**

`src/effects/halftone.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { halftone } from '@/effects/halftone'

describe('halftone effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = halftone.uniforms(halftone.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...halftone.uniformKeys].sort())
  })
  it('converts angle degrees to radians', () => {
    const u = halftone.uniforms({ cellSize: 8, angle: 180 }, { palettes: {} }) as { uAngle: number }
    expect(u.uAngle).toBeCloseTo(Math.PI, 5)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/effects/halftone.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the effect**

`src/effects/halftone.ts`:
```ts
import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uCellSize; uniform float uAngle;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  float cs = max(uCellSize, 2.0);
  vec2 p = vUv * resolution;
  float s = sin(uAngle), co = cos(uAngle);
  mat2 R = mat2(co, -s, s, co);
  mat2 Rt = mat2(co, s, -s, co); // inverse rotation
  vec2 rp = R * p;
  vec2 cellCenterR = (floor(rp / cs) + 0.5) * cs;
  vec2 center = Rt * cellCenterR;
  float l = luma(texture(src, clamp(center / resolution, 0.0, 1.0)).rgb);
  float radius = (1.0 - l) * 0.5 * cs * 1.20;
  float d = distance(p, center);
  float dot_ = smoothstep(radius + 1.0, radius - 1.0, d);
  vec3 col = mix(vec3(1.0), vec3(0.0), dot_);
  fragColor = vec4(col, 1.0);
}`

export const halftone: GpuEffect = {
  kind: 'gpu',
  type: 'halftone',
  name: 'Halftone',
  family: 'halftone',
  defaultParams: { cellSize: 8, angle: 45 },
  controls: [
    { type: 'slider', key: 'cellSize', label: 'Cell Size', min: 2, max: 40, step: 1 },
    { type: 'angle', key: 'angle', label: 'Angle' },
  ],
  frag: FRAG,
  uniformKeys: ['uCellSize', 'uAngle'],
  uniforms: (p) => ({
    uCellSize: Number(p.cellSize),
    uAngle: (Number(p.angle) * Math.PI) / 180,
  }),
}
```

Edit `src/effects/registry.ts` — add `halftone` after `bayer`:
```ts
import { halftone } from '@/effects/halftone'
// ...
export const EFFECT_LIST: Effect[] = [grade, pixelate, bayer, halftone, floyd]
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/effects/halftone.test.ts src/effects/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add circular halftone effect"
```

---

## Task 10: GPU effect — Palette Mapping

**Files:**
- Create: `src/effects/palette.ts`
- Modify: `src/effects/registry.ts`
- Test: `src/effects/palette.test.ts`

**Interfaces:**
- Consumes: `GpuEffect`, `EffectContext`, `PALETTES` (Tasks 3).
- Produces: `paletteEffect: GpuEffect`, `type: 'palette'`. `uniforms()` returns per-element keys `uPalette[0]`..`uPalette[15]` (each an `[r,g,b]` vec3, unused slots black) plus `uCount`, reading `ctx.palettes[params.paletteId]`.

- [ ] **Step 1: Write the failing test**

`src/effects/palette.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { paletteEffect } from '@/effects/palette'
import { PALETTES } from '@/color/palettes'

describe('palette effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = paletteEffect.uniforms(paletteEffect.defaultParams, { palettes: PALETTES })
    expect(Object.keys(u).sort()).toEqual([...paletteEffect.uniformKeys].sort())
  })
  it('emits one vec3 per palette slot (bw: black, white, then padding) with a count', () => {
    const u = paletteEffect.uniforms({ paletteId: 'bw' }, { palettes: PALETTES }) as Record<string, unknown>
    expect(u.uCount).toBe(2)
    expect(u['uPalette[0]']).toEqual([0, 0, 0]) // black
    expect(u['uPalette[1]']).toEqual([1, 1, 1]) // white
    expect(u['uPalette[2]']).toEqual([0, 0, 0]) // unused slot padded
    expect(u['uPalette[15]']).toEqual([0, 0, 0])
  })
  it('falls back to bw when the palette id is unknown', () => {
    const u = paletteEffect.uniforms({ paletteId: 'nope' }, { palettes: PALETTES }) as { uCount: number }
    expect(u.uCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/effects/palette.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the effect**

`src/effects/palette.ts`:
```ts
import type { GpuEffect, Palette } from '@/effects/types'
import { PALETTES } from '@/color/palettes'

const MAX = 16

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform vec3 uPalette[${MAX}];
uniform int uCount;
void main() {
  vec3 c = texture(src, vUv).rgb;
  float best = 1e9; vec3 pick = c;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    vec3 d = c - uPalette[i];
    float dist = dot(d, d);
    if (dist < best) { best = dist; pick = uPalette[i]; }
  }
  fragColor = vec4(pick, 1.0);
}`

// regl expands `uniform vec3 uPalette[16]` into per-element active uniforms named
// `uPalette[0]`..`uPalette[15]`, and binds uniforms by EXACT name. A single flat
// `uPalette` key would match no active uniform (silently unbound -> NaN). So we emit
// one key per element, each a [r,g,b] vec3, padding unused slots with black.
const PALETTE_KEYS = Array.from({ length: MAX }, (_, i) => `uPalette[${i}]`)

function paletteUniforms(palette: Palette): Record<string, unknown> {
  const u: Record<string, unknown> = { uCount: Math.min(palette.colors.length, MAX) }
  for (let i = 0; i < MAX; i++) {
    const c = palette.colors[i]
    u[`uPalette[${i}]`] = c ? [c[0], c[1], c[2]] : [0, 0, 0]
  }
  return u
}

export const paletteEffect: GpuEffect = {
  kind: 'gpu',
  type: 'palette',
  name: 'Palette Map',
  family: 'color',
  defaultParams: { paletteId: 'gameboy' },
  controls: [
    { type: 'palette', key: 'paletteId', label: 'Palette' },
  ],
  frag: FRAG,
  uniformKeys: [...PALETTE_KEYS, 'uCount'],
  uniforms: (p, ctx) => {
    const palette = ctx.palettes[String(p.paletteId)] ?? PALETTES.bw
    return paletteUniforms(palette)
  },
}
```

Edit `src/effects/registry.ts` — add `paletteEffect` at the end (before floyd is fine; final order: grade, pixelate, bayer, halftone, palette, floyd):
```ts
import { paletteEffect } from '@/effects/palette'
// ...
export const EFFECT_LIST: Effect[] = [grade, pixelate, bayer, halftone, paletteEffect, floyd]
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/effects/palette.test.ts src/effects/registry.test.ts`
Expected: PASS.

> Implementer note: uniforms are emitted per array element (`uPalette[0]`..`uPalette[15]`), because regl binds array uniforms by their per-element active-uniform names, not a single base name. The generic `quadCommand` declares each key as a `regl.prop`, so bracketed keys flow through unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add palette mapping effect"
```

---

## Task 11: Zustand store

**Files:**
- Create: `src/store/store.ts`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `StackNode` (Task 5), `registry` (Task 3), `Params`, `Palette`, `PALETTES`.
- Produces: `useStore` (React hook) built on a vanilla store. State: `source`, `stack: StackNode[]`, `selectedId`, `palettes`. Actions: `setSource`, `addNode(type)`, `removeNode(id)`, `toggleNode(id)`, `reorderNode(from, to)`, `duplicateNode(id)`, `updateParam(id, key, value)`, `selectNode(id)`. Exposes `createAppStore()` for tests.

- [ ] **Step 1: Write the failing test**

`src/store/store.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createAppStore } from '@/store/store'

describe('app store', () => {
  it('adds a node with default params and selects it', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const { stack, selectedId } = s.getState()
    expect(stack).toHaveLength(1)
    expect(stack[0].type).toBe('bayer')
    expect(stack[0].enabled).toBe(true)
    expect(stack[0].params).toMatchObject({ matrix: '4', levels: 2 })
    expect(selectedId).toBe(stack[0].id)
  })

  it('updates a single param immutably', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const id = s.getState().stack[0].id
    s.getState().updateParam(id, 'levels', 4)
    expect(s.getState().stack[0].params.levels).toBe(4)
  })

  it('toggles enabled', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const id = s.getState().stack[0].id
    s.getState().toggleNode(id)
    expect(s.getState().stack[0].enabled).toBe(false)
  })

  it('reorders nodes', () => {
    const s = createAppStore()
    s.getState().addNode('grade')
    s.getState().addNode('bayer')
    const [a, b] = s.getState().stack.map((n) => n.id)
    s.getState().reorderNode(0, 1)
    expect(s.getState().stack.map((n) => n.id)).toEqual([b, a])
  })

  it('duplicates a node right after the original with fresh id', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const id = s.getState().stack[0].id
    s.getState().duplicateNode(id)
    const stack = s.getState().stack
    expect(stack).toHaveLength(2)
    expect(stack[1].id).not.toBe(id)
    expect(stack[1].params).toEqual(stack[0].params)
    expect(stack[1].params).not.toBe(stack[0].params) // deep copy
  })

  it('removes a node and clears selection if it was selected', () => {
    const s = createAppStore()
    s.getState().addNode('bayer')
    const id = s.getState().stack[0].id
    s.getState().removeNode(id)
    expect(s.getState().stack).toHaveLength(0)
    expect(s.getState().selectedId).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/store/store.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the store**

`src/store/store.ts`:
```ts
import { createStore } from 'zustand/vanilla'
import { useStore as useZustand } from 'zustand'
import type { StackNode } from '@/engine/planPasses'
import type { Palette, ParamValue } from '@/effects/types'
import { registry } from '@/effects/registry'
import { PALETTES } from '@/color/palettes'

export interface SourceImage {
  image: ImageData
  width: number
  height: number
}

export interface AppState {
  source: SourceImage | null
  stack: StackNode[]
  selectedId: string | null
  palettes: Record<string, Palette>
  setSource: (source: SourceImage) => void
  addNode: (type: string) => void
  removeNode: (id: string) => void
  toggleNode: (id: string) => void
  reorderNode: (from: number, to: number) => void
  duplicateNode: (id: string) => void
  updateParam: (id: string, key: string, value: ParamValue) => void
  selectNode: (id: string | null) => void
}

const newId = () => crypto.randomUUID()

export function createAppStore() {
  return createStore<AppState>((set) => ({
    source: null,
    stack: [],
    selectedId: null,
    palettes: PALETTES,

    setSource: (source) => set({ source }),

    addNode: (type) =>
      set((s) => {
        const def = registry[type]
        if (!def) return s
        const node: StackNode = {
          id: newId(),
          type,
          enabled: true,
          params: structuredClone(def.defaultParams),
        }
        return { stack: [...s.stack, node], selectedId: node.id }
      }),

    removeNode: (id) =>
      set((s) => ({
        stack: s.stack.filter((n) => n.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      })),

    toggleNode: (id) =>
      set((s) => ({
        stack: s.stack.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)),
      })),

    reorderNode: (from, to) =>
      set((s) => {
        const stack = [...s.stack]
        const [moved] = stack.splice(from, 1)
        stack.splice(to, 0, moved)
        return { stack }
      }),

    duplicateNode: (id) =>
      set((s) => {
        const i = s.stack.findIndex((n) => n.id === id)
        if (i < 0) return s
        const copy: StackNode = {
          ...s.stack[i],
          id: newId(),
          params: structuredClone(s.stack[i].params),
        }
        const stack = [...s.stack]
        stack.splice(i + 1, 0, copy)
        return { stack, selectedId: copy.id }
      }),

    updateParam: (id, key, value) =>
      set((s) => ({
        stack: s.stack.map((n) =>
          n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n,
        ),
      })),

    selectNode: (id) => set({ selectedId: id }),
  }))
}

export const appStore = createAppStore()
export const useStore = <T>(selector: (s: AppState) => T): T => useZustand(appStore, selector)
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/store/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Zustand store for source + effect stack"
```

---

## Task 12: App shell, WebGL2 guard, and layout

**Files:**
- Create: `src/ui/AppShell.tsx`, `src/ui/Toolbar.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/AppShell.test.tsx`

**Interfaces:**
- Consumes: shadcn `resizable`, `button`, `sonner` (Task 2).
- Produces: `AppShell` renders a three-region layout (left stack region, center viewport region, right controls region) inside `ResizablePanelGroup`, with `Toolbar` on top. Exposes stable `data-testid`s: `stack-region`, `viewport-region`, `controls-region`. `hasWebGL2()` helper and a blocking fallback message when WebGL2 is unavailable.

- [ ] **Step 1: Write the failing test**

`src/ui/AppShell.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from '@/ui/AppShell'

describe('AppShell', () => {
  it('renders the three editor regions', () => {
    render(
      <AppShell
        stack={<div>stack</div>}
        viewport={<div>viewport</div>}
        controls={<div>controls</div>}
      />,
    )
    expect(screen.getByTestId('stack-region')).toBeInTheDocument()
    expect(screen.getByTestId('viewport-region')).toBeInTheDocument()
    expect(screen.getByTestId('controls-region')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/ui/AppShell.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the toolbar and shell**

`src/ui/Toolbar.tsx`:
```tsx
import { Button } from '@/components/ui/button'

interface ToolbarProps {
  onUpload: (file: File) => void
  onReset: () => void
  onExport: () => void
  canExport: boolean
}

export function Toolbar({ onUpload, onReset, onExport, canExport }: ToolbarProps) {
  return (
    <div className="flex h-12 items-center justify-between border-b px-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold tracking-tight">dithrrd</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.target.value = ''
            }}
          />
          <span className="inline-flex h-9 items-center rounded-md border px-3 hover:bg-accent">
            Open image
          </span>
        </label>
        <Button variant="ghost" onClick={onReset}>Reset</Button>
        <Button onClick={onExport} disabled={!canExport}>Export PNG</Button>
      </div>
    </div>
  )
}
```

`src/ui/AppShell.tsx`:
```tsx
import type { ReactNode } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

interface AppShellProps {
  toolbar?: ReactNode
  stack: ReactNode
  viewport: ReactNode
  controls: ReactNode
}

export function AppShell({ toolbar, stack, viewport, controls }: AppShellProps) {
  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={20} minSize={14}>
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
        <ResizablePanel defaultSize={24} minSize={16}>
          <div data-testid="controls-region" className="h-full overflow-hidden border-l">
            {controls}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

export function WebGL2Fallback() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      This tool requires WebGL2, which your browser or device does not support.
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/ui/AppShell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire a minimal App (compile check; full wiring in Tasks 13–16)**

`src/App.tsx`:
```tsx
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
```

- [ ] **Step 6: Run tests + build**

Run:
```bash
pnpm test
pnpm build
```
Expected: PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add app shell layout, toolbar, and WebGL2 guard"
```

---

## Task 13: Image decode + Viewport wired to the engine

**Files:**
- Create: `src/features/image.ts`, `src/ui/Viewport.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/image.test.ts`

**Interfaces:**
- Consumes: `createReglBackend` (Task 5), `planPasses`/`execute` (Task 5), `registry` (Task 3), `createRunCpu` (Task 4), store (Task 11).
- Produces:
  - `MAX_WORKING_EDGE = 4096` and `fitWorkingSize(w, h, max): { width, height }` (pure, tested).
  - `decodeToWorkingImage(file: File): Promise<SourceImage>` — decodes, downscales to working size, returns `ImageData`.
  - `Viewport` component: creates the regl backend for the current source, re-runs the engine whenever `source`/`stack`/`palettes` change (debounced via rAF), draws to a canvas fit into the region.

- [ ] **Step 1: Write the failing test for fitWorkingSize**

`src/features/image.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fitWorkingSize } from '@/features/image'

describe('fitWorkingSize', () => {
  it('leaves images within the cap unchanged', () => {
    expect(fitWorkingSize(800, 600, 4096)).toEqual({ width: 800, height: 600 })
  })
  it('scales down by the long edge, preserving aspect ratio', () => {
    expect(fitWorkingSize(8000, 4000, 4096)).toEqual({ width: 4096, height: 2048 })
  })
  it('handles portrait orientation', () => {
    expect(fitWorkingSize(4000, 8000, 4096)).toEqual({ width: 2048, height: 4096 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/features/image.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement image utilities**

`src/features/image.ts`:
```ts
import type { SourceImage } from '@/store/store'

export const MAX_WORKING_EDGE = 4096

export function fitWorkingSize(
  w: number,
  h: number,
  max: number,
): { width: number; height: number } {
  const long = Math.max(w, h)
  if (long <= max) return { width: w, height: h }
  const scale = max / long
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

export async function decodeToWorkingImage(file: File): Promise<SourceImage> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = fitWorkingSize(bitmap.width, bitmap.height, MAX_WORKING_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { image: ctx.getImageData(0, 0, width, height), width, height }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/features/image.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the Viewport (manual visual verification)**

`src/ui/Viewport.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import { useStore } from '@/store/store'
import { planPasses } from '@/engine/planPasses'
import { execute } from '@/engine/execute'
import { createReglBackend, type Backend } from '@/engine/backend'
import { registry } from '@/effects/registry'
import { createRunCpu } from '@/worker/runCpu'

export function Viewport() {
  const source = useStore((s) => s.source)
  const stack = useStore((s) => s.stack)
  const palettes = useStore((s) => s.palettes)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backendRef = useRef<(Backend & { dispose(): void }) | null>(null)
  const cpuRef = useRef<ReturnType<typeof createRunCpu> | null>(null)
  const rafRef = useRef<number>(0)
  // Monotonic render id. Guards against presenting a superseded/older render
  // (out-of-order) or one whose backend was disposed on a source change.
  const genRef = useRef(0)

  // (Re)create the backend when the source changes.
  useEffect(() => {
    backendRef.current?.dispose()
    backendRef.current = null
    if (!source || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = source.width
    canvas.height = source.height
    backendRef.current = createReglBackend(canvas, source.image, source.width, source.height)
    return () => {
      backendRef.current?.dispose()
      backendRef.current = null
    }
  }, [source])

  // Lazily create the CPU worker client once.
  useEffect(() => {
    cpuRef.current = createRunCpu()
    return () => {
      cpuRef.current?.dispose()
      cpuRef.current = null
    }
  }, [])

  // Render on any state change, debounced to one rAF.
  useEffect(() => {
    if (!source) return
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const backend = backendRef.current
      const cpu = cpuRef.current
      if (!backend || !cpu) return
      const gen = ++genRef.current
      const steps = planPasses(stack, registry)
      execute(steps, backend, { runCpu: cpu.runCpu, palettes })
        .then((tex) => {
          // Drop this frame if a newer render started (out-of-order) or the
          // backend was swapped/disposed on a source change (stale closure).
          if (gen !== genRef.current || backendRef.current !== backend) return
          backend.present(tex)
        })
        .catch(() => {
          // A superseded render can reject when its backend/worker is disposed
          // mid-flight; that's expected — swallow so it isn't an unhandled rejection.
        })
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [source, stack, palettes])

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Open an image to begin
      </div>
    )
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden p-4"
      style={{
        backgroundImage:
          'repeating-conic-gradient(#00000010 0% 25%, transparent 0% 50%)',
        backgroundSize: '20px 20px',
      }}
    >
      <canvas
        ref={canvasRef}
        className="max-h-full max-w-full object-contain shadow-sm"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  )
}
```

- [ ] **Step 6: Wire Viewport + upload into App**

Replace `src/App.tsx`:
```tsx
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
```

- [ ] **Step 7: Manual verification**

Run: `pnpm dev`, open the app, click **Open image**, pick a photo.
Expected: the photo appears on a checkerboard background. No console errors. (No effects yet — stack panel is Task 14.)

- [ ] **Step 8: Run tests + build**

Run:
```bash
pnpm test
pnpm build
```
Expected: PASS; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: decode images and render live preview via the engine"
```

---

## Task 14: Effect stack panel

**Files:**
- Create: `src/ui/StackPanel.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/StackPanel.test.tsx`

**Interfaces:**
- Consumes: store actions (Task 11), `EFFECT_LIST` (Task 3), shadcn `button`, `select`, `switch`, `scroll-area`, `separator`.
- Produces: `StackPanel` — an `+ Add` menu grouped by family; a list of nodes each showing name, an enable `Switch`, select-on-click, move up/down buttons, duplicate, and remove.

- [ ] **Step 1: Write the failing test**

`src/ui/StackPanel.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StackPanel } from '@/ui/StackPanel'
import { appStore } from '@/store/store'

beforeEach(() => {
  appStore.setState({ stack: [], selectedId: null })
})

describe('StackPanel', () => {
  it('adds an effect from the add menu', async () => {
    const user = userEvent.setup()
    render(<StackPanel />)
    await user.click(screen.getByRole('button', { name: /add/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Bayer Dither' }))
    expect(appStore.getState().stack).toHaveLength(1)
    expect(appStore.getState().stack[0].type).toBe('bayer')
  })

  it('removes a node via its remove button', async () => {
    const user = userEvent.setup()
    appStore.getState().addNode('bayer')
    render(<StackPanel />)
    await user.click(screen.getByRole('button', { name: /remove/i }))
    expect(appStore.getState().stack).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/ui/StackPanel.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the panel**

> Uses shadcn `dropdown-menu` for the add menu. If it is not already installed, run `pnpm dlx shadcn@latest add dropdown-menu -y` before implementing.

`src/ui/StackPanel.tsx`:
```tsx
import { ChevronDown, Copy, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
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
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Add <ChevronDown className="ml-1 size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {FAMILY_ORDER.map((family) => {
              const items = EFFECT_LIST.filter((e) => e.family === family)
              if (items.length === 0) return null
              return (
                <div key={family}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {FAMILY_LABEL[family]}
                  </DropdownMenuLabel>
                  {items.map((e) => (
                    <DropdownMenuItem key={e.type} onSelect={() => addNode(e.type)}>
                      {e.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
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
                  onClick={(e) => { e.stopPropagation(); reorderNode(i, i - 1) }}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  aria-label="Move down"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={i === stack.length - 1}
                  onClick={(e) => { e.stopPropagation(); reorderNode(i, i + 1) }}
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  aria-label="Duplicate"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); duplicateNode(node.id) }}
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  aria-label="Remove"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); removeNode(node.id) }}
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/ui/StackPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire StackPanel into App**

In `src/App.tsx`, replace the `stack={...}` prop with `stack={<StackPanel />}` and add `import { StackPanel } from '@/ui/StackPanel'`.

- [ ] **Step 6: Run tests + build + manual check**

Run:
```bash
pnpm test
pnpm build
```
Then `pnpm dev`: open an image, add **Pixelate + Posterize** then **Bayer Dither**, toggle/reorder, confirm the preview updates live.
Expected: tests pass, build succeeds, preview reacts to stack edits.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add effect stack panel with add/reorder/toggle/duplicate/remove"
```

---

## Task 15: Auto-generated controls panel

**Files:**
- Create: `src/ui/Control.tsx`, `src/ui/ControlsPanel.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/ControlsPanel.test.tsx`

**Interfaces:**
- Consumes: store (Task 11), `registry` (Task 3), `Control` type (Task 3), `PALETTES` (Task 3), shadcn `slider`, `select`, `switch`, `label`.
- Produces: `ControlsPanel` — renders controls for the selected node from its effect's `controls` schema; edits call `updateParam`. `Control` renders one control by `type`.

- [ ] **Step 1: Write the failing test**

`src/ui/ControlsPanel.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ControlsPanel } from '@/ui/ControlsPanel'
import { appStore } from '@/store/store'

beforeEach(() => {
  appStore.setState({ stack: [], selectedId: null })
})

describe('ControlsPanel', () => {
  it('prompts to select a node when nothing is selected', () => {
    render(<ControlsPanel />)
    expect(screen.getByText(/select an effect/i)).toBeInTheDocument()
  })

  it('renders a labeled control per param of the selected effect', () => {
    appStore.getState().addNode('bayer') // controls: matrix (select), levels (slider)
    render(<ControlsPanel />)
    expect(screen.getByText('Matrix')).toBeInTheDocument()
    expect(screen.getByText('Levels')).toBeInTheDocument()
    // slider exposes a slider role
    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/ui/ControlsPanel.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the Control renderer**

`src/ui/Control.tsx`:
```tsx
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Control as ControlSchema, ParamValue } from '@/effects/types'
import { PALETTES } from '@/color/palettes'

interface ControlProps {
  control: ControlSchema
  value: ParamValue
  onChange: (value: ParamValue) => void
}

export function Control({ control, value, onChange }: ControlProps) {
  switch (control.type) {
    case 'slider':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{control.label}</Label>
            <span className="tabular-nums text-xs text-muted-foreground">{Number(value)}</span>
          </div>
          <Slider
            min={control.min}
            max={control.max}
            step={control.step}
            value={[Number(value)]}
            onValueChange={(v) => onChange((Array.isArray(v) ? v[0] : v) as number)}
          />
        </div>
      )
    case 'angle':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{control.label}</Label>
            <span className="tabular-nums text-xs text-muted-foreground">{Number(value)}°</span>
          </div>
          <Slider min={0} max={360} step={1} value={[Number(value)]} onValueChange={(v) => onChange((Array.isArray(v) ? v[0] : v) as number)} />
        </div>
      )
    case 'toggle':
      return (
        <div className="flex items-center justify-between">
          <Label className="text-xs">{control.label}</Label>
          <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />
        </div>
      )
    case 'select':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{control.label}</Label>
          <Select value={String(value)} onValueChange={(v) => onChange(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {control.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    case 'palette':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{control.label}</Label>
          <Select value={String(value)} onValueChange={(v) => onChange(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(PALETTES).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
  }
}
```

`src/ui/ControlsPanel.tsx`:
```tsx
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStore } from '@/store/store'
import { registry } from '@/effects/registry'
import { Control } from '@/ui/Control'

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

  return (
    <div className="flex h-full flex-col">
      <div className="p-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/ui/ControlsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire ControlsPanel into App**

In `src/App.tsx`, replace the `controls={...}` prop with `controls={<ControlsPanel />}` and add `import { ControlsPanel } from '@/ui/ControlsPanel'`.

- [ ] **Step 6: Run tests + build + manual check**

Run:
```bash
pnpm test
pnpm build
```
Then `pnpm dev`: add a Bayer node, select it, drag Levels/Matrix and confirm the preview changes; add a Palette Map node and switch palettes; add Floyd–Steinberg and confirm it dithers (CPU path).
Expected: tests pass, build succeeds, all controls drive the preview.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add schema-driven controls panel"
```

---

## Task 16: PNG export

**Files:**
- Create: `src/features/exportPng.ts`
- Modify: `src/App.tsx`, `src/ui/Viewport.tsx`
- Test: `src/features/exportPng.test.ts`

**Interfaces:**
- Consumes: `Backend` (Task 5), `execute`/`planPasses` (Task 5), store, `toast` (sonner).
- Produces:
  - `flipY(data: Uint8ClampedArray, width, height): Uint8ClampedArray` (pure, tested) — flips row order for canvas orientation.
  - `pixelsToPngBlob(data, width, height): Promise<Blob>` — writes RGBA into a 2D canvas and returns a PNG blob.
  - `exportCurrentPng(backend, stack, palettes, runCpu): Promise<void>` — runs the stack, reads back the final framebuffer, downloads a PNG.
  - Viewport exposes its backend + runCpu to App via a ref callback so export reuses the live pipeline.

- [ ] **Step 1: Write the failing test for flipY**

`src/features/exportPng.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { flipY } from '@/features/exportPng'

describe('flipY', () => {
  it('reverses row order of an RGBA buffer', () => {
    // 1x2 image: row0 = red, row1 = green
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
    const out = flipY(data, 1, 2)
    expect(Array.from(out)).toEqual([0, 255, 0, 255, 255, 0, 0, 255])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/features/exportPng.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement export helpers**

`src/features/exportPng.ts`:
```ts
import type { Backend } from '@/engine/backend'
import type { StackNode } from '@/engine/planPasses'
import type { Palette } from '@/effects/types'
import type { RunCpu } from '@/worker/runCpu'
import { planPasses } from '@/engine/planPasses'
import { execute } from '@/engine/execute'
import { registry } from '@/effects/registry'

export function flipY(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length)
  const rowBytes = width * 4
  for (let y = 0; y < height; y++) {
    const src = y * rowBytes
    const dst = (height - 1 - y) * rowBytes
    out.set(data.subarray(src, src + rowBytes), dst)
  }
  return out
}

export async function pixelsToPngBlob(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.putImageData(new ImageData(data, width, height), 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
}

export async function exportCurrentPng(
  backend: Backend,
  stack: StackNode[],
  palettes: Record<string, Palette>,
  runCpu: RunCpu,
): Promise<void> {
  const steps = planPasses(stack, registry)
  // Reuse the engine's render loop; execute() returns the final texture (does not present).
  const finalTex = await execute(steps, backend, { runCpu, palettes })

  const [width, height] = backend.size()
  const { data } = backend.readback(finalTex)
  const flipped = flipY(data, width, height)
  const blob = await pixelsToPngBlob(flipped, width, height)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'dithrrd.png'
  a.click()
  URL.revokeObjectURL(url)
}
```

> Note: `exportCurrentPng` shares the exact render loop used by the live preview — the only difference is preview calls `backend.present(finalTex)` while export calls `backend.readback(finalTex)`. When the final node is GPU, `finalTex` is a pool fbo texture `backend.readback` can locate; when the stack is empty or ends on a CPU node, `readback` handles the source/uploaded texture path (see Task 5 Step 9 note).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/features/exportPng.test.ts`
Expected: PASS.

- [ ] **Step 5: Expose the backend from Viewport and wire export + error toasts**

In `src/ui/Viewport.tsx`, add an `onReady` prop so App can access the live backend + runCpu:
```tsx
// add to the props:
interface ViewportProps {
  onReady?: (api: { backend: Backend; runCpu: RunCpu } | null) => void
}
```
Import `RunCpu`:
```tsx
import type { RunCpu } from '@/worker/runCpu'
```
Change the component signature to `export function Viewport({ onReady }: ViewportProps)`, and inside the source `useEffect`, after creating `backendRef.current`, publish it:
```tsx
    backendRef.current = createReglBackend(canvas, source.image, source.width, source.height)
    onReady?.({ backend: backendRef.current, runCpu: cpuRef.current!.runCpu })
    return () => {
      backendRef.current?.dispose()
      backendRef.current = null
      onReady?.(null)
    }
```
(Ensure the CPU worker `useEffect` runs before the source effect by keeping it declared first, so `cpuRef.current` is set; if `cpuRef.current` is null at first source load, guard with `if (cpuRef.current) onReady?.(...)` and also publish from the CPU effect once ready. For Phase 1 simplicity, initialize `cpuRef.current = createRunCpu()` lazily at module scope of the effect: declare the CPU `useEffect` above the source `useEffect`.)

Update `src/App.tsx` to hold the api in a ref, wire export, and show toasts:
```tsx
import { useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { AppShell, hasWebGL2, WebGL2Fallback } from '@/ui/AppShell'
import { Toolbar } from '@/ui/Toolbar'
import { Viewport } from '@/ui/Viewport'
import { StackPanel } from '@/ui/StackPanel'
import { ControlsPanel } from '@/ui/ControlsPanel'
import { useStore } from '@/store/store'
import { decodeToWorkingImage } from '@/features/image'
import { exportCurrentPng } from '@/features/exportPng'
import type { Backend } from '@/engine/backend'
import type { RunCpu } from '@/worker/runCpu'

export default function App() {
  const setSource = useStore((s) => s.setSource)
  const source = useStore((s) => s.source)
  const stack = useStore((s) => s.stack)
  const palettes = useStore((s) => s.palettes)
  const apiRef = useRef<{ backend: Backend; runCpu: RunCpu } | null>(null)

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
          <Toolbar onUpload={onUpload} onReset={() => location.reload()} onExport={onExport} canExport={!!source} />
        }
        stack={<StackPanel />}
        viewport={<Viewport onReady={(api) => (apiRef.current = api)} />}
        controls={<ControlsPanel />}
      />
      <Toaster position="bottom-center" />
    </>
  )
}
```

- [ ] **Step 6: Run tests + build + manual check**

Run:
```bash
pnpm test
pnpm build
```
Then `pnpm dev`: open an image, build a stack (e.g., Grade → Pixelate → Bayer → Palette Map), click **Export PNG**.
Expected: a `dithrrd.png` downloads matching the on-screen result (right-side up, same look), and a success toast appears. Trigger a decode error by opening a non-image to confirm the error toast.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add PNG export and error toasts"
```

---

## Self-Review

**1. Spec coverage (Phase 1 items):**
- Full architecture (engine, effect stack, shadcn shell) → Tasks 1, 2, 5, 12. ✓
- WebGL2 via regl → Task 5. ✓
- One effect per family (Bayer=ordered, Floyd–Steinberg=diffusion, circular halftone, pixelate+posterize) → Tasks 4, 7, 8, 9. ✓
- Pre-process grade → Task 6. ✓
- Palette mapping + one preset palette (bw, gray4, gameboy provided) → Tasks 3, 10. ✓
- Reorderable/toggle/duplicate/remove effect stack, schema-driven controls → Tasks 11, 14, 15. ✓
- Live 60fps preview via GPU; CPU worker for error diffusion → Tasks 4, 5, 13. ✓
- PNG export at working resolution → Task 16. ✓
- Error handling: WebGL2 detection (Task 12), decode failure toast (Task 16), worker fallback (worker handler no-ops unknown types). ✓
- Minimal, readable UI, color used sparingly → enforced by aesthetic constraint; neutral shadcn theme, accents only on active state/primary action. ✓

**2. Placeholder scan:** No "TBD"/"implement later". Every code step shows complete code. The one deferred item (export size multipliers) is explicitly out of Phase 1 per Global Constraints, not a placeholder.

**3. Type consistency:** `StackNode` defined in Task 5, reused by store (Task 11), export (Task 16). `Backend`/`TexHandle`/`FboHandle` from Task 5 used consistently. `RunCpu` from Task 4 used by execute (5), viewport (13), export (16). Effect `uniforms()` returns keys matching `uniformKeys` — asserted by a test in each GPU effect task. `paletteEffect` export name (not `palette`) used consistently in Task 10 and registry. `EFFECT_LIST` order finalized as `[grade, pixelate, bayer, halftone, paletteEffect, floyd]`.

**Known Phase-1 simplifications (documented, acceptable):**
- `readback` wraps any texture in a throwaway framebuffer, so CPU-first stacks and CPU-final stacks read correctly (no default-framebuffer fallback).
- regl flat-array palette uniform: fallback to indexed props documented in Task 10.
- Export renders at working resolution (≤4096 long edge), matching preview; multipliers deferred.
