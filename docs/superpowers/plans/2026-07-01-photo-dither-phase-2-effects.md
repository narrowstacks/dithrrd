# Photo Dither Customizer — Phase 2A: Remaining Effects Per Family — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broaden each effect family with the remaining Phase 2 effects — five more error-diffusion algorithms (Atkinson, Jarvis, Stucki, Sierra, Burkes), clustered-dot ordered dithering, line-screen and crosshatch halftone patterns, and pixelate sampling/dither-before-quantize options — all as additive files that appear automatically in the "Add" menu.

**Architecture:** Effects are declarative modules registered in `EFFECT_LIST`. GPU effects supply a GLSL ES 3.00 fragment shader + a pure `uniforms(params)` map; CPU (error-diffusion) effects run in a Web Worker keyed by effect `type`. The five new diffusion algorithms share a single generic `diffuse()` engine parameterized by a kernel, so each new one is just a kernel table + a thin effect module. The "Add" menu groups by `family` automatically, and `addNode` reads defaults from the registry, so no UI or store code changes are needed for any new effect.

**Tech Stack:** TypeScript, regl (WebGL2), Web Worker, Vitest. Package manager: **pnpm**.

## Global Constraints

- **Package manager:** pnpm only. Run tests with `pnpm exec vitest run <file>` (single file) or `pnpm test` (all). Typecheck with `pnpm exec tsc -b`.
- **Path alias:** `@/` → `src/`.
- **Effect model:** one file per effect exporting a `GpuEffect` or `CpuEffect`. Register by adding to `EFFECT_LIST` in `src/effects/registry.ts`. No bespoke per-effect UI — controls render from the `controls` schema. Supported control types already implemented: `slider`, `select`, `toggle`, `angle`, `palette`.
- **Adding a CPU effect also requires** a worker handler keyed by `type` in `src/worker/dither.worker.ts` (this is the code that actually runs during render; `CpuEffect.process` exists for type-completeness and mirrors the worker path).
- **Palette colors:** `[r, g, b]` floats `0..1` (not relevant to this plan; no effect here consumes palettes).
- **Shaders:** GLSL ES 3.00 (`#version 300 es`), `precision highp float;`, inputs `in vec2 vUv`, output `out vec4 fragColor`, always provided uniforms `sampler2D src` + `vec2 resolution`. Preserve source alpha: `fragColor.a` must come from `texture(src, …).a`, never a hardcoded `1.0`.
- **Commits:** Conventional Commit messages, one per task.
- **GPU-effect tests** follow the existing convention: assert the `uniforms()` map produces exactly the declared `uniformKeys` and that params convert correctly. (No headless-WebGL pixel assertions for GPU effects — that matches `bayer.test.ts` / `halftone.test.ts` / `pixelate.test.ts`.)

---

## File Structure

```
src/
  worker/
    algorithms.ts        # MODIFY: add DiffusionKernel type, generic diffuse(), KERNELS map
    algorithms.test.ts   # MODIFY: tests for diffuse() + each new kernel
    dither.worker.ts     # MODIFY: register a generic handler per KERNELS entry
  effects/
    atkinson.ts          # CREATE: CpuEffect (diffusion)
    atkinson.test.ts     # CREATE
    jarvis.ts            # CREATE
    jarvis.test.ts       # CREATE
    stucki.ts            # CREATE
    stucki.test.ts       # CREATE
    sierra.ts            # CREATE
    sierra.test.ts       # CREATE
    burkes.ts            # CREATE
    burkes.test.ts       # CREATE
    clusteredDot.ts      # CREATE: GpuEffect (ordered)
    clusteredDot.test.ts # CREATE
    lineScreen.ts        # CREATE: GpuEffect (halftone)
    lineScreen.test.ts   # CREATE
    crosshatch.ts        # CREATE: GpuEffect (halftone)
    crosshatch.test.ts   # CREATE
    pixelate.ts          # MODIFY: add sampling mode + dither-before-quantize
    pixelate.test.ts     # MODIFY: assert new uniform keys
    registry.ts          # MODIFY: import + append all new effects to EFFECT_LIST
```

**Menu grouping is automatic.** `StackPanel.tsx` renders `FAMILY_ORDER.map(...) → EFFECT_LIST.filter(e => e.family === family)`. New `diffusion` effects appear under "Error Diffusion", `ordered` under "Ordered", `halftone` under "Halftone". Order within a family = order in `EFFECT_LIST`. No `StackPanel.tsx` edit is needed.

---

## Task 1: Generic error-diffusion engine (`diffuse()` + first kernel)

Introduces a kernel-parameterized diffusion function so the five new algorithms are each just a data table. Proven correct by re-deriving Floyd–Steinberg through it and asserting byte-for-byte equality with the trusted `floydSteinberg`.

**Files:**
- Modify: `src/worker/algorithms.ts`
- Test: `src/worker/algorithms.test.ts`

**Interfaces:**
- Consumes: existing module-scope `quantize(value, levels)` and `floydSteinberg(buf, w, h, {levels, serpentine})` in `algorithms.ts`.
- Produces:
  - `interface DiffusionKernel { divisor: number; cells: { dx: number; dy: number; w: number }[] }`
  - `function diffuse(buf: Uint8ClampedArray, width: number, height: number, params: { levels: number; serpentine: boolean }, kernel: DiffusionKernel): void` — mutates `buf` in place; alpha untouched; `dx` is mirrored by scan direction for serpentine.
  - `const KERNELS: Record<string, DiffusionKernel>` — starts with `atkinson`; later tasks add more.

- [ ] **Step 1: Write the failing test**

Add to `src/worker/algorithms.test.ts` (keep existing imports/tests; extend the import line and append a new describe block):

```ts
import { describe, it, expect } from 'vitest'
import { floydSteinberg, diffuse, KERNELS, type DiffusionKernel } from '@/worker/algorithms'

// (existing `gray` helper and `floydSteinberg` describe block stay as-is)

const FS_KERNEL: DiffusionKernel = {
  divisor: 16,
  cells: [
    { dx: 1, dy: 0, w: 7 },
    { dx: -1, dy: 1, w: 3 },
    { dx: 0, dy: 1, w: 5 },
    { dx: 1, dy: 1, w: 1 },
  ],
}

function ramp(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const v = (i * 37) % 256
    buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = v
    buf[i * 4 + 3] = 255
  }
  return buf
}

describe('diffuse (generic engine)', () => {
  it('with the Floyd–Steinberg kernel matches floydSteinberg byte-for-byte', () => {
    const w = 4, h = 4
    const a = ramp(w, h)
    const b = ramp(w, h)
    floydSteinberg(a, w, h, { levels: 2, serpentine: true })
    diffuse(b, w, h, { levels: 2, serpentine: true }, FS_KERNEL)
    expect(Array.from(b)).toEqual(Array.from(a))
  })

  it('leaves alpha untouched', () => {
    const buf = new Uint8ClampedArray([100, 100, 100, 128])
    diffuse(buf, 1, 1, { levels: 2, serpentine: false }, KERNELS.atkinson)
    expect(buf[3]).toBe(128)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts`
Expected: FAIL — `diffuse`/`KERNELS`/`DiffusionKernel` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/worker/algorithms.ts` (after the existing `floydSteinberg` function; `quantize` is already defined at module scope):

```ts
export interface DiffusionKernel {
  divisor: number
  cells: { dx: number; dy: number; w: number }[]
}

/**
 * Kernel-parameterized error diffusion. Same structure as `floydSteinberg`:
 * accumulate error in a Float array, quantize left-to-right (or serpentine),
 * and spread the residual to `kernel.cells`. `dx` is mirrored by scan direction
 * so serpentine rows diffuse symmetrically. Alpha (index 3) is never touched.
 */
export function diffuse(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  params: { levels: number; serpentine: boolean },
  kernel: DiffusionKernel,
): void {
  const { levels, serpentine } = params
  const { divisor, cells } = kernel
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
        for (const cell of cells) {
          add(x + dir * cell.dx, y + cell.dy, c, (err * cell.w) / divisor)
        }
      }
    }
  }

  for (let p = 0; p < width * height; p++) {
    for (let c = 0; c < 3; c++) buf[p * 4 + c] = f[p * 3 + c]
    // alpha (index 3) left untouched
  }
}

/**
 * Error-diffusion kernels keyed by effect `type`. The worker registers one
 * handler per entry, and each effect module references its kernel by name.
 * `divisor` may exceed the sum of weights (Atkinson) to intentionally lose error.
 */
export const KERNELS: Record<string, DiffusionKernel> = {
  atkinson: {
    divisor: 8,
    cells: [
      { dx: 1, dy: 0, w: 1 },
      { dx: 2, dy: 0, w: 1 },
      { dx: -1, dy: 1, w: 1 },
      { dx: 0, dy: 1, w: 1 },
      { dx: 1, dy: 1, w: 1 },
      { dx: 0, dy: 2, w: 1 },
    ],
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts`
Expected: PASS (all blocks, including the pre-existing `floydSteinberg` tests).

- [ ] **Step 5: Commit**

```bash
git add src/worker/algorithms.ts src/worker/algorithms.test.ts
git commit -m "feat: generic kernel-parameterized error-diffusion engine"
```

---

## Task 2: Atkinson effect (end-to-end) + generic worker handler

Wires the diffusion pipeline: a generic worker handler registered per `KERNELS` entry (so every present and future kernel is dispatchable), the Atkinson `CpuEffect` module, and registry entry. After this task Atkinson is selectable in the running app.

**Files:**
- Modify: `src/worker/dither.worker.ts`
- Create: `src/effects/atkinson.ts`
- Create: `src/effects/atkinson.test.ts`
- Modify: `src/effects/registry.ts`
- Test (algorithm): `src/worker/algorithms.test.ts`

**Interfaces:**
- Consumes: `diffuse`, `KERNELS` from `@/worker/algorithms`; `CpuEffect` from `@/effects/types`.
- Produces: `export const atkinson: CpuEffect` with `type: 'atkinson'`.

- [ ] **Step 1: Write the failing algorithm test**

Append to `src/worker/algorithms.test.ts`:

```ts
describe('atkinson kernel', () => {
  it('snaps a single mid-gray pixel to black or white at 2 levels', () => {
    const buf = new Uint8ClampedArray([100, 100, 100, 255])
    diffuse(buf, 1, 1, { levels: 2, serpentine: false }, KERNELS.atkinson)
    expect([0, 255]).toContain(buf[0])
    expect(buf[0]).toBe(buf[1])
    expect(buf[3]).toBe(255)
  })
  it('leaves pure black and pure white unchanged at 2 levels', () => {
    const black = new Uint8ClampedArray([0, 0, 0, 255])
    diffuse(black, 1, 1, { levels: 2, serpentine: false }, KERNELS.atkinson)
    expect(black[0]).toBe(0)
    const white = new Uint8ClampedArray([255, 255, 255, 255])
    diffuse(white, 1, 1, { levels: 2, serpentine: false }, KERNELS.atkinson)
    expect(white[0]).toBe(255)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts`
Expected: PASS actually? No — `KERNELS.atkinson` already exists from Task 1, so this test PASSES immediately. That is acceptable: it locks in behavior. If it passes, proceed to Step 3. (These are characterization tests for a kernel that already exists.)

- [ ] **Step 3: Add the generic worker handler**

Replace the body of `src/worker/dither.worker.ts` with:

```ts
import { floydSteinberg, diffuse, KERNELS } from './algorithms'
import type { Params } from '@/effects/types'

interface Req { id: number; type: string; buf: ArrayBuffer; width: number; height: number; params: Params }

type Handler = (buf: Uint8ClampedArray, w: number, h: number, p: Params) => void

const handlers: Record<string, Handler> = {
  floyd: (buf, w, h, p) =>
    floydSteinberg(buf, w, h, { levels: Number(p.levels), serpentine: Boolean(p.serpentine) }),
}

// Every diffusion kernel shares the generic engine; register a handler per kernel.
for (const [type, kernel] of Object.entries(KERNELS)) {
  handlers[type] = (buf, w, h, p) =>
    diffuse(buf, w, h, { levels: Number(p.levels), serpentine: Boolean(p.serpentine) }, kernel)
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, type, buf, width, height, params } = e.data
  const pixels = new Uint8ClampedArray(buf)
  handlers[type]?.(pixels, width, height, params)
  ;(self as unknown as Worker).postMessage({ id, buf: pixels.buffer }, [pixels.buffer])
}
```

- [ ] **Step 4: Create the Atkinson effect module**

Create `src/effects/atkinson.ts`:

```ts
import type { CpuEffect } from '@/effects/types'
import { diffuse, KERNELS } from '@/worker/algorithms'

export const atkinson: CpuEffect = {
  kind: 'cpu',
  type: 'atkinson',
  name: 'Atkinson',
  family: 'diffusion',
  defaultParams: { levels: 2, serpentine: true },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'toggle', key: 'serpentine', label: 'Serpentine' },
  ],
  process: (buf, w, h, params) =>
    diffuse(
      buf,
      w,
      h,
      { levels: Number(params.levels), serpentine: Boolean(params.serpentine) },
      KERNELS.atkinson,
    ),
}
```

- [ ] **Step 5: Write the effect test**

Create `src/effects/atkinson.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { atkinson } from '@/effects/atkinson'

describe('atkinson effect', () => {
  it('is a diffusion CPU effect with a matching worker kernel type', () => {
    expect(atkinson.kind).toBe('cpu')
    expect(atkinson.family).toBe('diffusion')
    expect(atkinson.type).toBe('atkinson')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(atkinson.controls.map((c) => c.key))
    for (const k of Object.keys(atkinson.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
```

- [ ] **Step 6: Register in EFFECT_LIST**

Edit `src/effects/registry.ts` — add the import and append to the list:

```ts
import { atkinson } from '@/effects/atkinson'
// ...existing imports...

export const EFFECT_LIST: Effect[] = [grade, pixelate, bayer, halftone, paletteEffect, floyd, atkinson]
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts src/effects/atkinson.test.ts src/effects/registry.test.ts`
Expected: PASS.
Run: `pnpm exec tsc -b`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/worker/dither.worker.ts src/effects/atkinson.ts src/effects/atkinson.test.ts src/effects/registry.ts src/worker/algorithms.test.ts
git commit -m "feat: Atkinson dithering + generic worker diffusion dispatch"
```

---

## Task 3: Jarvis–Judice–Ninke diffusion effect

**Files:**
- Modify: `src/worker/algorithms.ts` (add `jarvis` to `KERNELS`)
- Modify: `src/worker/algorithms.test.ts`
- Create: `src/effects/jarvis.ts`
- Create: `src/effects/jarvis.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Consumes: `diffuse`, `KERNELS` from `@/worker/algorithms`.
- Produces: `export const jarvis: CpuEffect` (`type: 'jarvis'`); `KERNELS.jarvis`.

- [ ] **Step 1: Write the failing test**

Append to `src/worker/algorithms.test.ts`:

```ts
describe('jarvis kernel', () => {
  it('snaps a single mid-gray pixel to black or white at 2 levels', () => {
    const buf = new Uint8ClampedArray([120, 120, 120, 255])
    diffuse(buf, 1, 1, { levels: 2, serpentine: false }, KERNELS.jarvis)
    expect([0, 255]).toContain(buf[0])
    expect(buf[3]).toBe(255)
  })
  it('leaves pure black and pure white unchanged', () => {
    const black = new Uint8ClampedArray([0, 0, 0, 255])
    diffuse(black, 1, 1, { levels: 2, serpentine: false }, KERNELS.jarvis)
    expect(black[0]).toBe(0)
    const white = new Uint8ClampedArray([255, 255, 255, 255])
    diffuse(white, 1, 1, { levels: 2, serpentine: false }, KERNELS.jarvis)
    expect(white[0]).toBe(255)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts`
Expected: FAIL — `KERNELS.jarvis` is `undefined` (`diffuse` throws reading `.divisor`).

- [ ] **Step 3: Add the kernel**

In `src/worker/algorithms.ts`, add to the `KERNELS` object (Jarvis–Judice–Ninke, divisor 48):

```ts
  jarvis: {
    divisor: 48,
    cells: [
      { dx: 1, dy: 0, w: 7 }, { dx: 2, dy: 0, w: 5 },
      { dx: -2, dy: 1, w: 3 }, { dx: -1, dy: 1, w: 5 }, { dx: 0, dy: 1, w: 7 }, { dx: 1, dy: 1, w: 5 }, { dx: 2, dy: 1, w: 3 },
      { dx: -2, dy: 2, w: 1 }, { dx: -1, dy: 2, w: 3 }, { dx: 0, dy: 2, w: 5 }, { dx: 1, dy: 2, w: 3 }, { dx: 2, dy: 2, w: 1 },
    ],
  },
```

- [ ] **Step 4: Create the effect module**

Create `src/effects/jarvis.ts`:

```ts
import type { CpuEffect } from '@/effects/types'
import { diffuse, KERNELS } from '@/worker/algorithms'

export const jarvis: CpuEffect = {
  kind: 'cpu',
  type: 'jarvis',
  name: 'Jarvis–Judice–Ninke',
  family: 'diffusion',
  defaultParams: { levels: 2, serpentine: true },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'toggle', key: 'serpentine', label: 'Serpentine' },
  ],
  process: (buf, w, h, params) =>
    diffuse(
      buf,
      w,
      h,
      { levels: Number(params.levels), serpentine: Boolean(params.serpentine) },
      KERNELS.jarvis,
    ),
}
```

- [ ] **Step 5: Create the effect test**

Create `src/effects/jarvis.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { jarvis } from '@/effects/jarvis'

describe('jarvis effect', () => {
  it('is a diffusion CPU effect', () => {
    expect(jarvis.kind).toBe('cpu')
    expect(jarvis.family).toBe('diffusion')
    expect(jarvis.type).toBe('jarvis')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(jarvis.controls.map((c) => c.key))
    for (const k of Object.keys(jarvis.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
```

- [ ] **Step 6: Register**

Edit `src/effects/registry.ts` — add `import { jarvis } from '@/effects/jarvis'` and append `jarvis` to `EFFECT_LIST`.

- [ ] **Step 7: Run tests**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts src/effects/jarvis.test.ts src/effects/registry.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/worker/algorithms.ts src/worker/algorithms.test.ts src/effects/jarvis.ts src/effects/jarvis.test.ts src/effects/registry.ts
git commit -m "feat: Jarvis–Judice–Ninke dithering"
```

---

## Task 4: Stucki diffusion effect

**Files:**
- Modify: `src/worker/algorithms.ts`, `src/worker/algorithms.test.ts`
- Create: `src/effects/stucki.ts`, `src/effects/stucki.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Produces: `export const stucki: CpuEffect` (`type: 'stucki'`); `KERNELS.stucki`.

- [ ] **Step 1: Write the failing test**

Append to `src/worker/algorithms.test.ts`:

```ts
describe('stucki kernel', () => {
  it('snaps a single mid-gray pixel to black or white at 2 levels', () => {
    const buf = new Uint8ClampedArray([120, 120, 120, 255])
    diffuse(buf, 1, 1, { levels: 2, serpentine: false }, KERNELS.stucki)
    expect([0, 255]).toContain(buf[0])
    expect(buf[3]).toBe(255)
  })
  it('leaves pure black and pure white unchanged', () => {
    const black = new Uint8ClampedArray([0, 0, 0, 255])
    diffuse(black, 1, 1, { levels: 2, serpentine: false }, KERNELS.stucki)
    expect(black[0]).toBe(0)
    const white = new Uint8ClampedArray([255, 255, 255, 255])
    diffuse(white, 1, 1, { levels: 2, serpentine: false }, KERNELS.stucki)
    expect(white[0]).toBe(255)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts`
Expected: FAIL — `KERNELS.stucki` is `undefined`.

- [ ] **Step 3: Add the kernel**

In `src/worker/algorithms.ts`, add to `KERNELS` (Stucki, divisor 42):

```ts
  stucki: {
    divisor: 42,
    cells: [
      { dx: 1, dy: 0, w: 8 }, { dx: 2, dy: 0, w: 4 },
      { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 8 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 },
      { dx: -2, dy: 2, w: 1 }, { dx: -1, dy: 2, w: 2 }, { dx: 0, dy: 2, w: 4 }, { dx: 1, dy: 2, w: 2 }, { dx: 2, dy: 2, w: 1 },
    ],
  },
```

- [ ] **Step 4: Create the effect module**

Create `src/effects/stucki.ts`:

```ts
import type { CpuEffect } from '@/effects/types'
import { diffuse, KERNELS } from '@/worker/algorithms'

export const stucki: CpuEffect = {
  kind: 'cpu',
  type: 'stucki',
  name: 'Stucki',
  family: 'diffusion',
  defaultParams: { levels: 2, serpentine: true },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'toggle', key: 'serpentine', label: 'Serpentine' },
  ],
  process: (buf, w, h, params) =>
    diffuse(
      buf,
      w,
      h,
      { levels: Number(params.levels), serpentine: Boolean(params.serpentine) },
      KERNELS.stucki,
    ),
}
```

- [ ] **Step 5: Create the effect test**

Create `src/effects/stucki.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { stucki } from '@/effects/stucki'

describe('stucki effect', () => {
  it('is a diffusion CPU effect', () => {
    expect(stucki.kind).toBe('cpu')
    expect(stucki.family).toBe('diffusion')
    expect(stucki.type).toBe('stucki')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(stucki.controls.map((c) => c.key))
    for (const k of Object.keys(stucki.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
```

- [ ] **Step 6: Register**

Edit `src/effects/registry.ts` — add `import { stucki } from '@/effects/stucki'` and append `stucki` to `EFFECT_LIST`.

- [ ] **Step 7: Run tests**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts src/effects/stucki.test.ts src/effects/registry.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/worker/algorithms.ts src/worker/algorithms.test.ts src/effects/stucki.ts src/effects/stucki.test.ts src/effects/registry.ts
git commit -m "feat: Stucki dithering"
```

---

## Task 5: Sierra diffusion effect

Uses the full three-row Sierra kernel (divisor 32).

**Files:**
- Modify: `src/worker/algorithms.ts`, `src/worker/algorithms.test.ts`
- Create: `src/effects/sierra.ts`, `src/effects/sierra.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Produces: `export const sierra: CpuEffect` (`type: 'sierra'`); `KERNELS.sierra`.

- [ ] **Step 1: Write the failing test**

Append to `src/worker/algorithms.test.ts`:

```ts
describe('sierra kernel', () => {
  it('snaps a single mid-gray pixel to black or white at 2 levels', () => {
    const buf = new Uint8ClampedArray([120, 120, 120, 255])
    diffuse(buf, 1, 1, { levels: 2, serpentine: false }, KERNELS.sierra)
    expect([0, 255]).toContain(buf[0])
    expect(buf[3]).toBe(255)
  })
  it('leaves pure black and pure white unchanged', () => {
    const black = new Uint8ClampedArray([0, 0, 0, 255])
    diffuse(black, 1, 1, { levels: 2, serpentine: false }, KERNELS.sierra)
    expect(black[0]).toBe(0)
    const white = new Uint8ClampedArray([255, 255, 255, 255])
    diffuse(white, 1, 1, { levels: 2, serpentine: false }, KERNELS.sierra)
    expect(white[0]).toBe(255)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts`
Expected: FAIL — `KERNELS.sierra` is `undefined`.

- [ ] **Step 3: Add the kernel**

In `src/worker/algorithms.ts`, add to `KERNELS` (Sierra-3, divisor 32):

```ts
  sierra: {
    divisor: 32,
    cells: [
      { dx: 1, dy: 0, w: 5 }, { dx: 2, dy: 0, w: 3 },
      { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 5 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 },
      { dx: -1, dy: 2, w: 2 }, { dx: 0, dy: 2, w: 3 }, { dx: 1, dy: 2, w: 2 },
    ],
  },
```

- [ ] **Step 4: Create the effect module**

Create `src/effects/sierra.ts`:

```ts
import type { CpuEffect } from '@/effects/types'
import { diffuse, KERNELS } from '@/worker/algorithms'

export const sierra: CpuEffect = {
  kind: 'cpu',
  type: 'sierra',
  name: 'Sierra',
  family: 'diffusion',
  defaultParams: { levels: 2, serpentine: true },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'toggle', key: 'serpentine', label: 'Serpentine' },
  ],
  process: (buf, w, h, params) =>
    diffuse(
      buf,
      w,
      h,
      { levels: Number(params.levels), serpentine: Boolean(params.serpentine) },
      KERNELS.sierra,
    ),
}
```

- [ ] **Step 5: Create the effect test**

Create `src/effects/sierra.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sierra } from '@/effects/sierra'

describe('sierra effect', () => {
  it('is a diffusion CPU effect', () => {
    expect(sierra.kind).toBe('cpu')
    expect(sierra.family).toBe('diffusion')
    expect(sierra.type).toBe('sierra')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(sierra.controls.map((c) => c.key))
    for (const k of Object.keys(sierra.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
```

- [ ] **Step 6: Register**

Edit `src/effects/registry.ts` — add `import { sierra } from '@/effects/sierra'` and append `sierra` to `EFFECT_LIST`.

- [ ] **Step 7: Run tests**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts src/effects/sierra.test.ts src/effects/registry.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/worker/algorithms.ts src/worker/algorithms.test.ts src/effects/sierra.ts src/effects/sierra.test.ts src/effects/registry.ts
git commit -m "feat: Sierra dithering"
```

---

## Task 6: Burkes diffusion effect

Two-row Burkes kernel (divisor 32).

**Files:**
- Modify: `src/worker/algorithms.ts`, `src/worker/algorithms.test.ts`
- Create: `src/effects/burkes.ts`, `src/effects/burkes.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Produces: `export const burkes: CpuEffect` (`type: 'burkes'`); `KERNELS.burkes`.

- [ ] **Step 1: Write the failing test**

Append to `src/worker/algorithms.test.ts`:

```ts
describe('burkes kernel', () => {
  it('snaps a single mid-gray pixel to black or white at 2 levels', () => {
    const buf = new Uint8ClampedArray([120, 120, 120, 255])
    diffuse(buf, 1, 1, { levels: 2, serpentine: false }, KERNELS.burkes)
    expect([0, 255]).toContain(buf[0])
    expect(buf[3]).toBe(255)
  })
  it('leaves pure black and pure white unchanged', () => {
    const black = new Uint8ClampedArray([0, 0, 0, 255])
    diffuse(black, 1, 1, { levels: 2, serpentine: false }, KERNELS.burkes)
    expect(black[0]).toBe(0)
    const white = new Uint8ClampedArray([255, 255, 255, 255])
    diffuse(white, 1, 1, { levels: 2, serpentine: false }, KERNELS.burkes)
    expect(white[0]).toBe(255)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts`
Expected: FAIL — `KERNELS.burkes` is `undefined`.

- [ ] **Step 3: Add the kernel**

In `src/worker/algorithms.ts`, add to `KERNELS` (Burkes, divisor 32):

```ts
  burkes: {
    divisor: 32,
    cells: [
      { dx: 1, dy: 0, w: 8 }, { dx: 2, dy: 0, w: 4 },
      { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 8 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 },
    ],
  },
```

- [ ] **Step 4: Create the effect module**

Create `src/effects/burkes.ts`:

```ts
import type { CpuEffect } from '@/effects/types'
import { diffuse, KERNELS } from '@/worker/algorithms'

export const burkes: CpuEffect = {
  kind: 'cpu',
  type: 'burkes',
  name: 'Burkes',
  family: 'diffusion',
  defaultParams: { levels: 2, serpentine: true },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'toggle', key: 'serpentine', label: 'Serpentine' },
  ],
  process: (buf, w, h, params) =>
    diffuse(
      buf,
      w,
      h,
      { levels: Number(params.levels), serpentine: Boolean(params.serpentine) },
      KERNELS.burkes,
    ),
}
```

- [ ] **Step 5: Create the effect test**

Create `src/effects/burkes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { burkes } from '@/effects/burkes'

describe('burkes effect', () => {
  it('is a diffusion CPU effect', () => {
    expect(burkes.kind).toBe('cpu')
    expect(burkes.family).toBe('diffusion')
    expect(burkes.type).toBe('burkes')
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(burkes.controls.map((c) => c.key))
    for (const k of Object.keys(burkes.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
```

- [ ] **Step 6: Register**

Edit `src/effects/registry.ts` — add `import { burkes } from '@/effects/burkes'` and append `burkes` to `EFFECT_LIST`.

- [ ] **Step 7: Run tests**

Run: `pnpm exec vitest run src/worker/algorithms.test.ts src/effects/burkes.test.ts src/effects/registry.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/worker/algorithms.ts src/worker/algorithms.test.ts src/effects/burkes.ts src/effects/burkes.test.ts src/effects/registry.ts
git commit -m "feat: Burkes dithering"
```

---

## Task 7: Clustered-dot ordered dithering (GPU)

A GPU ordered-dither effect using an 8×8 clustered-dot (spiral) threshold matrix — produces halftone-like dot gain via thresholding. Same posterize structure as `bayer.ts`.

**Files:**
- Create: `src/effects/clusteredDot.ts`
- Create: `src/effects/clusteredDot.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Consumes: `GpuEffect` from `@/effects/types`.
- Produces: `export const clusteredDot: GpuEffect` (`type: 'clusteredDot'`, `family: 'ordered'`, `uniformKeys: ['uLevels']`).

- [ ] **Step 1: Write the failing test**

Create `src/effects/clusteredDot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clusteredDot } from '@/effects/clusteredDot'

describe('clusteredDot effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = clusteredDot.uniforms(clusteredDot.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...clusteredDot.uniformKeys].sort())
  })
  it('passes levels through', () => {
    expect(clusteredDot.uniforms({ levels: 3 }, { palettes: {} })).toMatchObject({ uLevels: 3 })
  })
  it('is an ordered GPU effect', () => {
    expect(clusteredDot.kind).toBe('gpu')
    expect(clusteredDot.family).toBe('ordered')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/effects/clusteredDot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the effect module**

Create `src/effects/clusteredDot.ts`:

```ts
import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uLevels;

// 8x8 clustered-dot (spiral) threshold matrix, values 0..63.
const float CLUSTER8[64] = float[64](
 24.,10.,12.,26.,35.,47.,49.,37.,
  8., 0., 2.,14.,45.,59.,61.,51.,
 22., 6., 4.,16.,43.,57.,63.,53.,
 30.,20.,18.,28.,33.,41.,55.,39.,
 34.,46.,48.,38.,25.,11.,13.,27.,
 44.,58.,60.,50., 9., 1., 3.,15.,
 42.,56.,62.,52.,23., 7., 5.,17.,
 32.,40.,54.,36.,31.,21.,19.,29.);

void main() {
  ivec2 pix = ivec2(vUv * resolution);
  int x = int(mod(float(pix.x), 8.0));
  int y = int(mod(float(pix.y), 8.0));
  float t = CLUSTER8[y * 8 + x] / 64.0 - 0.5;
  float L = max(uLevels, 2.0);
  vec4 s = texture(src, vUv);
  vec3 c = clamp(s.rgb + t / (L - 1.0), 0.0, 1.0);
  c = floor(c * (L - 1.0) + 0.5) / (L - 1.0);
  fragColor = vec4(c, s.a);
}`

export const clusteredDot: GpuEffect = {
  kind: 'gpu',
  type: 'clusteredDot',
  name: 'Clustered Dot',
  family: 'ordered',
  defaultParams: { levels: 2 },
  controls: [{ type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 }],
  frag: FRAG,
  uniformKeys: ['uLevels'],
  uniforms: (p) => ({ uLevels: Number(p.levels) }),
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/effects/clusteredDot.test.ts`
Expected: PASS.

- [ ] **Step 5: Register**

Edit `src/effects/registry.ts` — add `import { clusteredDot } from '@/effects/clusteredDot'` and append `clusteredDot` to `EFFECT_LIST`.

- [ ] **Step 6: Commit**

```bash
git add src/effects/clusteredDot.ts src/effects/clusteredDot.test.ts src/effects/registry.ts
git commit -m "feat: clustered-dot ordered dithering"
```

---

## Task 8: Line-screen halftone (GPU)

A line-screen halftone: darker luma → wider inked lines along a rotatable axis. Same uniform shape as `halftone.ts` (`uCellSize`, `uAngle`).

**Files:**
- Create: `src/effects/lineScreen.ts`
- Create: `src/effects/lineScreen.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Produces: `export const lineScreen: GpuEffect` (`type: 'lineScreen'`, `family: 'halftone'`, `uniformKeys: ['uCellSize', 'uAngle']`).

- [ ] **Step 1: Write the failing test**

Create `src/effects/lineScreen.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { lineScreen } from '@/effects/lineScreen'

describe('lineScreen effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = lineScreen.uniforms(lineScreen.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...lineScreen.uniformKeys].sort())
  })
  it('converts angle degrees to radians', () => {
    const u = lineScreen.uniforms({ cellSize: 8, angle: 180 }, { palettes: {} }) as { uAngle: number }
    expect(u.uAngle).toBeCloseTo(Math.PI, 5)
  })
  it('is a halftone GPU effect', () => {
    expect(lineScreen.kind).toBe('gpu')
    expect(lineScreen.family).toBe('halftone')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/effects/lineScreen.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the effect module**

Create `src/effects/lineScreen.ts`:

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
  // coordinate along the screen axis
  float v = -p.x * s + p.y * co;
  // triangle wave 0..1 across each line pitch (0 at line center)
  float band = abs(fract(v / cs) - 0.5) * 2.0;
  vec4 srcC = texture(src, vUv);
  float l = luma(srcC.rgb);
  // darker -> wider inked band; anti-alias over ~2px expressed in band units
  float thr = 1.0 - l;
  float aa = 2.0 / cs;
  float ink = 1.0 - smoothstep(thr - aa, thr + aa, band);
  vec3 col = mix(vec3(1.0), vec3(0.0), ink);
  fragColor = vec4(col, srcC.a);
}`

export const lineScreen: GpuEffect = {
  kind: 'gpu',
  type: 'lineScreen',
  name: 'Line Screen',
  family: 'halftone',
  defaultParams: { cellSize: 8, angle: 45 },
  controls: [
    { type: 'slider', key: 'cellSize', label: 'Pitch', min: 2, max: 40, step: 1 },
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

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/effects/lineScreen.test.ts`
Expected: PASS.

- [ ] **Step 5: Register**

Edit `src/effects/registry.ts` — add `import { lineScreen } from '@/effects/lineScreen'` and append `lineScreen` to `EFFECT_LIST`.

- [ ] **Step 6: Commit**

```bash
git add src/effects/lineScreen.ts src/effects/lineScreen.test.ts src/effects/registry.ts
git commit -m "feat: line-screen halftone"
```

---

## Task 9: Crosshatch halftone (GPU)

Pencil-style crosshatch: progressively more hatch line-sets at different angles engage as luma darkens.

**Files:**
- Create: `src/effects/crosshatch.ts`
- Create: `src/effects/crosshatch.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Produces: `export const crosshatch: GpuEffect` (`type: 'crosshatch'`, `family: 'halftone'`, `uniformKeys: ['uCellSize', 'uAngle']`).

- [ ] **Step 1: Write the failing test**

Create `src/effects/crosshatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { crosshatch } from '@/effects/crosshatch'

describe('crosshatch effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = crosshatch.uniforms(crosshatch.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...crosshatch.uniformKeys].sort())
  })
  it('converts angle degrees to radians', () => {
    const u = crosshatch.uniforms({ cellSize: 6, angle: 90 }, { palettes: {} }) as { uAngle: number }
    expect(u.uAngle).toBeCloseTo(Math.PI / 2, 5)
  })
  it('is a halftone GPU effect', () => {
    expect(crosshatch.kind).toBe('gpu')
    expect(crosshatch.family).toBe('halftone')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/effects/crosshatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the effect module**

Create `src/effects/crosshatch.ts`:

```ts
import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uCellSize; uniform float uAngle;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// 1 on a thin line (~20% of pitch) along the given angle, else 0.
float lineSet(vec2 p, float ang, float pitch) {
  float u = p.x * cos(ang) + p.y * sin(ang);
  return step(fract(u / pitch), 0.2);
}

void main() {
  float cs = max(uCellSize, 3.0);
  vec2 p = vUv * resolution;
  vec4 srcC = texture(src, vUv);
  float l = luma(srcC.rgb);
  float a = uAngle;
  float ink = 0.0;
  if (l < 0.8) ink = max(ink, lineSet(p, a + 0.7854, cs));   // +45deg
  if (l < 0.6) ink = max(ink, lineSet(p, a - 0.7854, cs));   // -45deg
  if (l < 0.4) ink = max(ink, lineSet(p, a, cs));            // 0deg
  if (l < 0.2) ink = max(ink, lineSet(p, a + 1.5708, cs));   // +90deg
  vec3 col = mix(vec3(1.0), vec3(0.0), ink);
  fragColor = vec4(col, srcC.a);
}`

export const crosshatch: GpuEffect = {
  kind: 'gpu',
  type: 'crosshatch',
  name: 'Crosshatch',
  family: 'halftone',
  defaultParams: { cellSize: 6, angle: 0 },
  controls: [
    { type: 'slider', key: 'cellSize', label: 'Pitch', min: 3, max: 30, step: 1 },
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

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/effects/crosshatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Register**

Edit `src/effects/registry.ts` — add `import { crosshatch } from '@/effects/crosshatch'` and append `crosshatch` to `EFFECT_LIST`.

- [ ] **Step 6: Commit**

```bash
git add src/effects/crosshatch.ts src/effects/crosshatch.test.ts src/effects/registry.ts
git commit -m "feat: crosshatch halftone"
```

---

## Task 10: Pixelate — sampling mode + dither-before-quantize

Extends the existing `pixelate` effect with two options: a **sampling mode** (nearest cell-center vs a 4-tap box average) and a **dither-before-quantize** toggle (ordered 4×4 Bayer offset applied before posterizing to break up banding).

**Files:**
- Modify: `src/effects/pixelate.ts`
- Modify: `src/effects/pixelate.test.ts`

**Interfaces:**
- `pixelate` gains `uniformKeys: ['uPixelSize', 'uLevels', 'uSampling', 'uDither']`, params `sampling: 'nearest' | 'average'` and `dither: boolean`.

- [ ] **Step 1: Update the test to expect the new keys**

Replace `src/effects/pixelate.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { pixelate } from '@/effects/pixelate'

describe('pixelate effect', () => {
  it('maps params to declared uniform keys', () => {
    const u = pixelate.uniforms(pixelate.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...pixelate.uniformKeys].sort())
  })
  it('passes pixel size and levels through', () => {
    expect(pixelate.uniforms({ pixelSize: 6, levels: 4, sampling: 'nearest', dither: false }, { palettes: {} }))
      .toMatchObject({ uPixelSize: 6, uLevels: 4 })
  })
  it('encodes sampling mode and dither toggle as 0/1 floats', () => {
    expect(pixelate.uniforms({ pixelSize: 4, levels: 4, sampling: 'nearest', dither: false }, { palettes: {} }))
      .toMatchObject({ uSampling: 0, uDither: 0 })
    expect(pixelate.uniforms({ pixelSize: 4, levels: 4, sampling: 'average', dither: true }, { palettes: {} }))
      .toMatchObject({ uSampling: 1, uDither: 1 })
  })
  it('every default param has a matching control key', () => {
    const keys = new Set(pixelate.controls.map((c) => c.key))
    for (const k of Object.keys(pixelate.defaultParams)) expect(keys.has(k)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/effects/pixelate.test.ts`
Expected: FAIL — `uSampling`/`uDither` not present; `uniformKeys` mismatch.

- [ ] **Step 3: Update the effect module**

Replace `src/effects/pixelate.ts` with:

```ts
import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uPixelSize; uniform float uLevels;
uniform float uSampling; // 0 = nearest cell center, 1 = 4-tap box average
uniform float uDither;    // 0 = off, 1 = ordered dither before quantize

const float BAYER4[16] = float[16](
  0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);

void main() {
  float ps = max(uPixelSize, 1.0);
  vec2 cell = ps / resolution;
  vec2 base = floor(vUv / cell) * cell;
  vec2 centerUv = base + cell * 0.5;

  vec3 c;
  if (uSampling > 0.5) {
    // 4-tap box average across the cell (approximate downsample)
    vec2 q = cell * 0.25;
    c = ( texture(src, base + q).rgb
        + texture(src, base + vec2(q.x, cell.y - q.y)).rgb
        + texture(src, base + vec2(cell.x - q.x, q.y)).rgb
        + texture(src, base + cell - q).rgb ) * 0.25;
  } else {
    c = texture(src, centerUv).rgb;
  }

  float L = max(uLevels, 2.0);
  if (uDither > 0.5) {
    ivec2 pix = ivec2(vUv * resolution);
    int x = int(mod(float(pix.x), 4.0));
    int y = int(mod(float(pix.y), 4.0));
    float t = BAYER4[y * 4 + x] / 16.0 - 0.5;
    c = clamp(c + t / (L - 1.0), 0.0, 1.0);
  }
  c = floor(c * (L - 1.0) + 0.5) / (L - 1.0);
  fragColor = vec4(clamp(c, 0.0, 1.0), texture(src, centerUv).a);
}`

export const pixelate: GpuEffect = {
  kind: 'gpu',
  type: 'pixelate',
  name: 'Pixelate + Posterize',
  family: 'pixelate',
  defaultParams: { pixelSize: 4, levels: 4, sampling: 'nearest', dither: false },
  controls: [
    { type: 'slider', key: 'pixelSize', label: 'Pixel Size', min: 1, max: 64, step: 1 },
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 16, step: 1 },
    { type: 'select', key: 'sampling', label: 'Sampling', options: [
      { label: 'Nearest', value: 'nearest' }, { label: 'Average', value: 'average' },
    ] },
    { type: 'toggle', key: 'dither', label: 'Dither before quantize' },
  ],
  frag: FRAG,
  uniformKeys: ['uPixelSize', 'uLevels', 'uSampling', 'uDither'],
  uniforms: (p) => ({
    uPixelSize: Number(p.pixelSize),
    uLevels: Number(p.levels),
    uSampling: p.sampling === 'average' ? 1 : 0,
    uDither: p.dither ? 1 : 0,
  }),
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/effects/pixelate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/effects/pixelate.ts src/effects/pixelate.test.ts
git commit -m "feat: pixelate sampling mode + dither-before-quantize option"
```

---

## Task 11: Full verification pass

Confirm the whole suite is green, types check, and the production build succeeds (the build compiles all shaders' host code and the worker).

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all existing + new tests. In particular `registry.test.ts` confirms every new effect has a unique `type` and every default param has a control key.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm exec tsc -b`
Expected: no errors.
Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `pnpm dev`, open the app, upload an image, and confirm the "Add" menu now lists — under **Error Diffusion**: Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Sierra, Burkes; under **Ordered**: Bayer Dither, Clustered Dot; under **Halftone**: Halftone, Line Screen, Crosshatch. Add each once and confirm the preview renders without console errors and transparent PNGs stay transparent.

- [ ] **Step 4: Commit (only if any doc/tweak changed; otherwise skip)**

```bash
git add -A
git commit -m "test: verify Phase 2A effects suite green"
```

---

## Self-Review

**1. Spec coverage** (spec "Effect Catalog", Phase 2 "remaining effects per family"):
- Ordered/Bayer → clustered-dot: **Task 7.** ✓ (blue-noise, custom matrices are explicitly Phase 3 — out of scope here.)
- Error diffusion → Atkinson, Jarvis, Stucki, Sierra, Burkes: **Tasks 2–6.** ✓
- Halftone → line screen, crosshatch: **Tasks 8, 9.** ✓ (CMYK-angled separations = per-channel, handled by the separate Phase 2 "duotone / per-channel" plan.)
- Pixelation/quantize → downsample sampling modes, dither-before-quantize: **Task 10.** ✓

**2. Placeholder scan:** No "TBD"/"implement later". Every code step shows complete code (shaders, kernels, modules, tests). Task 2 Step 2 flags that its algorithm test may pass immediately (the Atkinson kernel was created in Task 1) — this is called out explicitly, not a placeholder.

**3. Type consistency:** All CPU effects use `diffuse(buf, w, h, { levels, serpentine }, KERNELS.<name>)` and export a `CpuEffect`; all `KERNELS` entries match `DiffusionKernel` (`divisor` + `cells[{dx,dy,w}]`). All GPU effects export a `GpuEffect` with `frag`, `uniformKeys`, and a `uniforms(params, ctx)` whose returned keys equal `uniformKeys` (enforced by each effect test). Worker `handlers` are keyed by the same `type` strings the effect modules declare (`atkinson`, `jarvis`, `stucki`, `sierra`, `burkes`), sourced from `KERNELS` keys. `registry.ts` `EFFECT_LIST` receives every new export.

**Known simplifications (documented, acceptable):**
- The `average` pixelate sampling is a 4-tap approximation, not a full box filter over arbitrary cell sizes (a full filter would be a variable-length shader loop, too slow for `pixelSize` up to 64). Adequate as a "mode".
- GPU-effect tests assert uniform mapping only (matching the Phase 1 convention); visual correctness of the new shaders is verified by the Task 11 manual smoke.
- `CpuEffect.process` is defined for each diffusion effect for type-completeness/parity with `floydSteinberg.ts`; the render path dispatches through the worker `handlers`, which is the code actually exercised.
