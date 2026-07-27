# Golden Fixture Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce committed PNG goldens for all 16 dithrrd effects, executed through the real WebGL2 pipeline, so the native Metal port can be verified kernel-by-kernel against known-correct output.

**Architecture:** Add a second vitest project running in real Chromium via Playwright (jsdom cannot execute WebGL2). A headless harness drives the existing `createReglBackend` + `execute` pipeline over a procedurally-generated source image. Goldens are written by a server-side vitest browser command and asserted with a per-pixel tolerance.

**Tech Stack:** TypeScript, vitest 3.2 browser mode, Playwright (Chromium), regl/WebGL2, existing dithrrd engine modules.

## Global Constraints

- This plan modifies the **existing** `dithrrd` repo, not the native port repo.
- The existing jsdom suite must keep passing unchanged. Baseline at plan authoring: **40 files, 149 tests passing** via `npm test`.
- Browser tests use the filename suffix `.browser.test.ts` and MUST be excluded from the jsdom config, whose `include` currently defaults to all `*.test.ts`.
- Goldens live in `fixtures/` at repo root and are committed to git.
- Golden comparison tolerance: max per-channel delta **2**, max differing-pixel fraction **0.001**. GPU output is not bit-stable across drivers; exact equality will produce flaky tests.
- Source image dimensions for all goldens: **256 × 256**. Small enough to commit, large enough to exercise 8×8 ordered-dither matrices and halftone cells.
- Do not modify any file under `src/effects/`, `src/engine/`, or `src/worker/`. This plan only adds a test harness around them.

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (modify) | Exclude `*.browser.test.ts` from the jsdom project |
| `vitest.browser.config.ts` (create) | Chromium browser project + `writeGolden` server command |
| `package.json` (modify) | Playwright/browser devDeps and `test:browser` script |
| `src/testing/testImage.ts` | Deterministic procedural source image |
| `src/testing/png.ts` | RGBA ↔ PNG encode/decode in the browser |
| `src/testing/renderStack.ts` | Headless harness over the real regl pipeline |
| `src/testing/goldens.ts` | Tolerance comparison + write/assert golden |
| `src/testing/effects.browser.test.ts` | Table-driven goldens for all 16 effects + stacks |
| `fixtures/*.png` | Committed golden images |

---

### Task 1: Browser test runner

**Files:**
- Modify: `vitest.config.ts:10-14`
- Create: `vitest.browser.config.ts`
- Modify: `package.json` (devDependencies, scripts)
- Test: `src/testing/webgl.browser.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `npm run test:browser` runs `*.browser.test.ts` in headless Chromium with a working WebGL2 context.

- [ ] **Step 1: Install browser-test dependencies**

```bash
npm i -D @vitest/browser@^3.2.4 playwright@^1.49.0
npx playwright install chromium
```

- [ ] **Step 2: Write the failing test**

Create `src/testing/webgl.browser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('browser test runner', () => {
  it('provides a WebGL2 context', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const gl = canvas.getContext('webgl2')
    expect(gl).not.toBeNull()
  })

  it('compiles a #version 300 es fragment shader', () => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')!
    const sh = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(sh, `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }`)
    gl.compileShader(sh)
    expect(gl.getShaderParameter(sh, gl.COMPILE_STATUS)).toBe(true)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:browser`
Expected: FAIL — the `test:browser` script does not exist yet.

- [ ] **Step 4: Create the browser config**

Create `vitest.browser.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
      commands: {
        writeGolden: async (_ctx: unknown, name: string, base64: string) => {
          const dir = path.resolve(process.cwd(), 'fixtures')
          await mkdir(dir, { recursive: true })
          await writeFile(path.join(dir, `${name}.png`), Buffer.from(base64, 'base64'))
          return true
        },
      },
    },
  },
})
```

- [ ] **Step 5: Exclude browser tests from the jsdom project**

In `vitest.config.ts`, replace the `test` block (lines 10-14) with:

```ts
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.browser.test.ts'],
  },
```

- [ ] **Step 6: Add the script**

In `package.json`, add to `scripts`:

```json
    "test:browser": "vitest run --config vitest.browser.config.ts",
```

- [ ] **Step 7: Run both suites**

Run: `npm run test:browser`
Expected: PASS, 2 tests.

Run: `npm test`
Expected: PASS, still 40 files / 149 tests. The browser test must NOT appear here.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.browser.config.ts src/testing/webgl.browser.test.ts
git commit -m "test: add browser-mode vitest project with real WebGL2"
```

---

### Task 2: Procedural test image

**Files:**
- Create: `src/testing/testImage.ts`
- Test: `src/testing/testImage.browser.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `makeTestImage(width: number, height: number): ImageData`

**Why procedural:** committing a photo as the source would add a binary blob whose decode differs across platforms. A generated image is reproducible byte-for-byte and can be regenerated identically in Zig for the native port's own harness.

The image must exercise every effect family: a smooth gradient (banding, ordered dither), saturated hues (palette mapping, duotone), a grayscale ramp (levels quantization), and hard edges (pixelate, halftone).

- [ ] **Step 1: Write the failing test**

Create `src/testing/testImage.browser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeTestImage } from '@/testing/testImage'

describe('makeTestImage', () => {
  it('returns an ImageData of the requested size', () => {
    const img = makeTestImage(256, 256)
    expect(img.width).toBe(256)
    expect(img.height).toBe(256)
    expect(img.data.length).toBe(256 * 256 * 4)
  })

  it('is deterministic across calls', () => {
    const a = makeTestImage(64, 64)
    const b = makeTestImage(64, 64)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })

  it('is fully opaque', () => {
    const img = makeTestImage(32, 32)
    for (let p = 0; p < 32 * 32; p++) expect(img.data[p * 4 + 3]).toBe(255)
  })

  it('spans a wide luminance range', () => {
    const img = makeTestImage(256, 256)
    let min = 255
    let max = 0
    for (let p = 0; p < 256 * 256; p++) {
      const v = img.data[p * 4]
      if (v < min) min = v
      if (v > max) max = v
    }
    expect(min).toBeLessThan(16)
    expect(max).toBeGreaterThan(239)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:browser`
Expected: FAIL — cannot resolve `@/testing/testImage`.

- [ ] **Step 3: Implement**

Create `src/testing/testImage.ts`:

```ts
/**
 * Deterministic source image for golden fixtures. Four horizontal bands, each
 * exercising a different effect family:
 *   0: smooth grayscale ramp   — levels quantization, banding
 *   1: saturated hue sweep     — palette mapping, duotone
 *   2: diagonal luminance ramp — ordered dither, error diffusion
 *   3: hard checkerboard       — pixelate, halftone, crosshatch
 * No randomness: the same bytes on every platform and in every language.
 */
export function makeTestImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  const band = Math.max(1, Math.floor(height / 4))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const u = width === 1 ? 0 : x / (width - 1)
      const v = height === 1 ? 0 : y / (height - 1)
      let r = 0
      let g = 0
      let b = 0

      switch (Math.min(3, Math.floor(y / band))) {
        case 0: {
          const l = Math.round(u * 255)
          r = l
          g = l
          b = l
          break
        }
        case 1: {
          const rgb = hueToRgb(u)
          r = rgb[0]
          g = rgb[1]
          b = rgb[2]
          break
        }
        case 2: {
          const l = Math.round(((u + v) / 2) * 255)
          r = l
          g = Math.round(l * 0.6)
          b = Math.round(255 - l * 0.8)
          break
        }
        default: {
          const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0
          r = on ? 245 : 10
          g = on ? 245 : 10
          b = on ? 245 : 10
        }
      }

      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }

  return new ImageData(data, width, height)
}

/** Fully-saturated, full-value hue at position `t` in [0,1). */
function hueToRgb(t: number): [number, number, number] {
  const h = (t % 1) * 6
  const s = Math.floor(h)
  const f = h - s
  const q = Math.round(255 * (1 - f))
  const w = Math.round(255 * f)
  switch (s % 6) {
    case 0: return [255, w, 0]
    case 1: return [q, 255, 0]
    case 2: return [0, 255, w]
    case 3: return [0, q, 255]
    case 4: return [w, 0, 255]
    default: return [255, 0, q]
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:browser`
Expected: PASS, 6 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/testing/testImage.ts src/testing/testImage.browser.test.ts
git commit -m "test: add deterministic procedural test image"
```

---

### Task 3: Headless render harness

**Files:**
- Create: `src/testing/renderStack.ts`
- Test: `src/testing/renderStack.browser.test.ts`

**Interfaces:**
- Consumes: `makeTestImage` (Task 2); existing `createReglBackend` (`src/engine/backend.ts`), `execute` (`src/engine/execute.ts`), `planPasses` and `StackNode` (`src/engine/planPasses.ts`), `registry` (`src/effects/registry.ts`), `RunCpu` (`src/worker/runCpu.ts`), `Palette` (`src/effects/types.ts`).
- Produces: `renderStack(source: ImageData, stack: StackNode[], palettes: Record<string, Palette>): Promise<Uint8ClampedArray>` — RGBA bytes in **top-down** row order matching the input `ImageData`.

**Orientation warning — read before implementing.** `createReglBackend` uploads the source texture with `flipY: true` (`src/engine/backend.ts:53`), while `backend.readback` uses `regl.read`, which returns rows **bottom-up**. The identity test below will fail until the harness flips rows back. Do not "fix" this by changing `backend.ts`; the flip belongs in the harness.

The worker-backed `createRunCpu` cannot be used here — it needs a live `Worker` and warms up asynchronously. The harness calls `effect.process` directly instead.

- [ ] **Step 1: Write the failing test**

Create `src/testing/renderStack.browser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeTestImage } from '@/testing/testImage'
import { renderStack } from '@/testing/renderStack'
import { PALETTES } from '@/color/palettes'

describe('renderStack', () => {
  it('returns the source unchanged for an empty stack', async () => {
    const src = makeTestImage(64, 64)
    const out = await renderStack(src, [], PALETTES)
    expect(out.length).toBe(src.data.length)
    for (let i = 0; i < out.length; i++) {
      expect(Math.abs(out[i] - src.data[i])).toBeLessThanOrEqual(1)
    }
  })

  it('skips disabled nodes', async () => {
    const src = makeTestImage(64, 64)
    const off = await renderStack(
      src,
      [{ id: 'a', type: 'bayer', enabled: false, params: { matrix: '4', levels: 2 } }],
      PALETTES,
    )
    for (let i = 0; i < off.length; i++) {
      expect(Math.abs(off[i] - src.data[i])).toBeLessThanOrEqual(1)
    }
  })

  it('runs a GPU effect and changes pixels', async () => {
    const src = makeTestImage(64, 64)
    const out = await renderStack(
      src,
      [{ id: 'a', type: 'bayer', enabled: true, params: { matrix: '4', levels: 2 } }],
      PALETTES,
    )
    let changed = 0
    for (let i = 0; i < out.length; i += 4) if (out[i] !== src.data[i]) changed++
    expect(changed).toBeGreaterThan(0)
  })

  it('runs a CPU diffusion effect and changes pixels', async () => {
    const src = makeTestImage(64, 64)
    const out = await renderStack(
      src,
      [{ id: 'a', type: 'atkinson', enabled: true, params: { levels: 2, serpentine: true } }],
      PALETTES,
    )
    let changed = 0
    for (let i = 0; i < out.length; i += 4) if (out[i] !== src.data[i]) changed++
    expect(changed).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:browser`
Expected: FAIL — cannot resolve `@/testing/renderStack`.

- [ ] **Step 3: Implement**

Create `src/testing/renderStack.ts`:

```ts
import { createReglBackend } from '@/engine/backend'
import { execute } from '@/engine/execute'
import { planPasses, type StackNode } from '@/engine/planPasses'
import { registry } from '@/effects/registry'
import type { Palette, Params } from '@/effects/types'
import type { RunCpu } from '@/worker/runCpu'

/** Runs CPU effects in-process. The worker path needs a live Worker and warms up async. */
const runCpuInline: RunCpu = async (
  type: string,
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  params: Params,
) => {
  const effect = registry[type]
  if (!effect || effect.kind !== 'cpu') throw new Error(`not a cpu effect: ${type}`)
  const copy = buf.slice()
  effect.process(copy, width, height, params)
  return copy
}

/** Flip RGBA rows in place-ish: regl.read returns bottom-up, ImageData is top-down. */
function flipRows(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const stride = width * 4
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * stride
    out.set(data.subarray(src, src + stride), y * stride)
  }
  return out
}

/**
 * Render `stack` over `source` through the real WebGL2 pipeline.
 * Returns RGBA bytes in top-down row order, matching the input ImageData.
 */
export async function renderStack(
  source: ImageData,
  stack: StackNode[],
  palettes: Record<string, Palette>,
): Promise<Uint8ClampedArray> {
  const { width, height } = source
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const backend = createReglBackend(canvas, source, width, height)
  try {
    const steps = planPasses(stack, registry)
    const tex = await execute(steps, backend, { runCpu: runCpuInline, palettes })
    const { data } = backend.readback(tex)
    return flipRows(data, width, height)
  } finally {
    backend.dispose()
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:browser`
Expected: PASS, 10 tests total.

If the first test fails with an inverted image, the flip is on the wrong side — remove `flipRows` and re-run to confirm which orientation `regl.read` actually returns on this driver, then keep whichever makes the identity test pass.

- [ ] **Step 5: Commit**

```bash
git add src/testing/renderStack.ts src/testing/renderStack.browser.test.ts
git commit -m "test: add headless render harness over the regl pipeline"
```

---

### Task 4: PNG codec and golden assertion

**Files:**
- Create: `src/testing/png.ts`
- Create: `src/testing/goldens.ts`
- Test: `src/testing/goldens.browser.test.ts`

**Interfaces:**
- Consumes: `writeGolden` server command (Task 1).
- Produces:
  - `encodePng(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array>`
  - `decodePng(bytes: Uint8Array): Promise<{ data: Uint8ClampedArray; width: number; height: number }>`
  - `compareRgba(a: Uint8ClampedArray, b: Uint8ClampedArray): { maxDelta: number; diffFraction: number }`
  - `assertGolden(name: string, rgba: Uint8ClampedArray, width: number, height: number): Promise<void>`

`assertGolden` writes the fixture when `import.meta.env.VITE_UPDATE_GOLDENS` is set, otherwise fetches `/fixtures/<name>.png` and compares.

- [ ] **Step 1: Write the failing test**

Create `src/testing/goldens.browser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encodePng, decodePng } from '@/testing/png'
import { compareRgba } from '@/testing/goldens'
import { makeTestImage } from '@/testing/testImage'

describe('png codec', () => {
  it('round-trips RGBA through PNG losslessly', async () => {
    const img = makeTestImage(32, 32)
    const bytes = await encodePng(img.data, 32, 32)
    const back = await decodePng(bytes)
    expect(back.width).toBe(32)
    expect(back.height).toBe(32)
    expect(Array.from(back.data)).toEqual(Array.from(img.data))
  })
})

describe('compareRgba', () => {
  it('reports zero difference for identical buffers', () => {
    const a = makeTestImage(16, 16).data
    const r = compareRgba(a, a.slice())
    expect(r.maxDelta).toBe(0)
    expect(r.diffFraction).toBe(0)
  })

  it('reports the largest per-channel delta', () => {
    const a = new Uint8ClampedArray([10, 10, 10, 255])
    const b = new Uint8ClampedArray([10, 17, 10, 255])
    expect(compareRgba(a, b).maxDelta).toBe(7)
  })

  it('reports the fraction of differing pixels', () => {
    const a = new Uint8ClampedArray(4 * 4)
    const b = new Uint8ClampedArray(4 * 4)
    b[4] = 9
    expect(compareRgba(a, b).diffFraction).toBeCloseTo(0.25, 5)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:browser`
Expected: FAIL — cannot resolve `@/testing/png`.

- [ ] **Step 3: Implement the codec**

Create `src/testing/png.ts`:

```ts
export async function encodePng(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.putImageData(new ImageData(rgba.slice(), width, height), 0, 0)
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
  return new Uint8Array(await blob.arrayBuffer())
}

export async function decodePng(
  bytes: Uint8Array,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const blob = new Blob([bytes], { type: 'image/png' })
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(bitmap, 0, 0)
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return { data: img.data, width: img.width, height: img.height }
}
```

- [ ] **Step 4: Implement golden comparison**

Create `src/testing/goldens.ts`:

```ts
import { expect } from 'vitest'
import { commands } from '@vitest/browser/context'
import { encodePng, decodePng } from '@/testing/png'

/** Tolerances: GPU output is not bit-stable across drivers. */
export const MAX_DELTA = 2
export const MAX_DIFF_FRACTION = 0.001

export function compareRgba(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
): { maxDelta: number; diffFraction: number } {
  if (a.length !== b.length) throw new Error(`length mismatch: ${a.length} vs ${b.length}`)
  let maxDelta = 0
  let differing = 0
  const pixels = a.length / 4
  for (let p = 0; p < pixels; p++) {
    let pixelDiffers = false
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a[p * 4 + c] - b[p * 4 + c])
      if (d > maxDelta) maxDelta = d
      if (d > 0) pixelDiffers = true
    }
    if (pixelDiffers) differing++
  }
  return { maxDelta, diffFraction: pixels === 0 ? 0 : differing / pixels }
}

export async function assertGolden(
  name: string,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<void> {
  const png = await encodePng(rgba, width, height)

  if (import.meta.env.VITE_UPDATE_GOLDENS) {
    let binary = ''
    for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i])
    await commands.writeGolden(name, btoa(binary))
    return
  }

  const res = await fetch(`/fixtures/${name}.png`)
  if (!res.ok) {
    throw new Error(
      `missing golden "${name}". Regenerate with: VITE_UPDATE_GOLDENS=1 npm run test:browser`,
    )
  }
  const golden = await decodePng(new Uint8Array(await res.arrayBuffer()))
  expect(golden.width).toBe(width)
  expect(golden.height).toBe(height)

  const { maxDelta, diffFraction } = compareRgba(golden.data, rgba)
  expect(
    maxDelta <= MAX_DELTA || diffFraction <= MAX_DIFF_FRACTION,
    `golden "${name}" drifted: maxDelta=${maxDelta} diffFraction=${diffFraction.toFixed(5)}`,
  ).toBe(true)
}
```

- [ ] **Step 5: Serve the fixtures directory**

In `vitest.browser.config.ts`, add `publicDir` so `/fixtures/*.png` resolves. Add this key at the top level of the config object, as a sibling of `resolve`:

```ts
  publicDir: fileURLToPath(new URL('./', import.meta.url)),
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npm run test:browser`
Expected: PASS, 14 tests total.

- [ ] **Step 7: Commit**

```bash
git add src/testing/png.ts src/testing/goldens.ts src/testing/goldens.browser.test.ts vitest.browser.config.ts
git commit -m "test: add PNG codec and golden comparison with tolerance"
```

---

### Task 5: Goldens for the 10 GPU effects

**Files:**
- Create: `src/testing/effects.browser.test.ts`
- Create: `fixtures/*.png` (generated, then committed)

**Interfaces:**
- Consumes: `makeTestImage`, `renderStack`, `assertGolden`, `PALETTES`.
- Produces: committed goldens named `<effectType>-default.png` for each GPU effect.

The 10 GPU effects are: `grade`, `pixelate`, `bayer`, `halftone`, `palette`, `clusteredDot`, `lineScreen`, `crosshatch`, `duotone`, `perChannel`. All are rendered with their own `defaultParams` except one.

**`grade` needs an override.** Its defaults are identity — `{ brightness: 0, contrast: 1, gamma: 1, saturation: 1 }` — so a golden taken at defaults would be a copy of the source and would pass even against a completely broken kernel. It gets explicit non-identity params. Every other effect's defaults produce visible change and are used as-is.

- [ ] **Step 1: Write the test**

Create `src/testing/effects.browser.test.ts`:

```ts
import { describe, it } from 'vitest'
import { EFFECT_LIST } from '@/effects/registry'
import type { Params } from '@/effects/types'
import { makeTestImage } from '@/testing/testImage'
import { renderStack } from '@/testing/renderStack'
import { assertGolden } from '@/testing/goldens'
import { PALETTES } from '@/color/palettes'

const SIZE = 256

/**
 * Effects whose defaultParams are an identity transform, and would therefore
 * produce a golden that cannot fail. Only `grade` qualifies today.
 */
const OVERRIDES: Record<string, Params> = {
  grade: { brightness: 0.15, contrast: 1.4, gamma: 0.8, saturation: 1.6 },
}

function goldenParams(type: string): Params {
  const effect = EFFECT_LIST.find((e) => e.type === type)
  if (!effect) throw new Error(`unknown effect: ${type}`)
  return OVERRIDES[type] ?? effect.defaultParams
}

describe('effect goldens', () => {
  for (const effect of EFFECT_LIST) {
    it(`${effect.type} matches its golden`, async () => {
      const src = makeTestImage(SIZE, SIZE)
      const out = await renderStack(
        src,
        [{ id: 'a', type: effect.type, enabled: true, params: goldenParams(effect.type) }],
        PALETTES,
      )
      await assertGolden(`${effect.type}-default`, out, SIZE, SIZE)
    })
  }
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:browser`
Expected: FAIL — 16 tests fail with `missing golden "<type>-default"`.

This failure is the point: it proves the assertion path works before any golden exists.

- [ ] **Step 3: Generate the goldens**

Run: `VITE_UPDATE_GOLDENS=1 npm run test:browser`
Expected: PASS. `fixtures/` now contains 16 PNGs.

- [ ] **Step 4: Verify the goldens are real output, not blanks**

Run:

```bash
ls -la fixtures/ && node -e "
const fs=require('fs');
for (const f of fs.readdirSync('fixtures')) {
  const s=fs.statSync('fixtures/'+f).size;
  if (s < 200) { console.error('SUSPICIOUS (near-empty):', f, s); process.exit(1); }
  console.log(f, s);
}"
```

Expected: 16 files, each comfortably over 200 bytes. A near-empty PNG means the render produced a blank frame.

Open two or three by eye and confirm they look like dithered versions of the four-band test image. A golden that is wrong-but-stable will silently certify a wrong Metal kernel later, so this visual check is not optional.

- [ ] **Step 5: Re-run to confirm goldens are stable**

Run: `npm run test:browser`
Expected: PASS, all 16 golden tests green against the committed files.

- [ ] **Step 6: Commit**

```bash
git add src/testing/effects.browser.test.ts fixtures/
git commit -m "test: add golden fixtures for all 16 effects"
```

---

### Task 6: Stack goldens and CI wiring

**Files:**
- Modify: `src/testing/effects.browser.test.ts`
- Create: `fixtures/stack-*.png`
- Modify: `package.json`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces: goldens for multi-effect stacks, including the GPU→CPU→GPU readback path that the native port must reproduce.

**Why stacks matter:** single-effect goldens never exercise `execute`'s CPU hop (`src/engine/execute.ts:19-24`), which is exactly the code path the native port replaces with Metal texture ping-pong. A stack that sandwiches a diffusion effect between two GPU effects is the highest-value fixture in this plan.

- [ ] **Step 1: Add the StackNode import**

At the top of `src/testing/effects.browser.test.ts`, alongside the existing imports, add:

```ts
import type { StackNode } from '@/engine/planPasses'
```

- [ ] **Step 2: Append the stack cases**

Append to the end of `src/testing/effects.browser.test.ts`. The literal params below are the real `defaultParams` from each effect module (`pixelate` uses `pixelSize`, not `size`); `grade` reuses the same non-identity override as Task 5.

```ts
const STACKS: { name: string; stack: StackNode[] }[] = [
  {
    name: 'stack-grade-bayer',
    stack: [
      { id: 'a', type: 'grade', enabled: true, params: goldenParams('grade') },
      { id: 'b', type: 'bayer', enabled: true, params: { matrix: '8', levels: 3 } },
    ],
  },
  {
    name: 'stack-gpu-cpu-gpu',
    stack: [
      {
        id: 'a',
        type: 'pixelate',
        enabled: true,
        params: { pixelSize: 8, levels: 4, sampling: 'nearest', dither: false },
      },
      { id: 'b', type: 'floyd', enabled: true, params: { levels: 2, serpentine: true } },
      { id: 'c', type: 'duotone', enabled: true, params: { paletteId: 'gameboy' } },
    ],
  },
]

describe('stack goldens', () => {
  for (const { name, stack } of STACKS) {
    it(`${name} matches its golden`, async () => {
      const src = makeTestImage(SIZE, SIZE)
      const out = await renderStack(src, stack, PALETTES)
      await assertGolden(name, out, SIZE, SIZE)
    })
  }
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:browser`
Expected: FAIL — 2 tests fail with `missing golden "stack-..."`.

- [ ] **Step 4: Generate and verify**

Run: `VITE_UPDATE_GOLDENS=1 npm run test:browser`
Expected: PASS. Two new PNGs in `fixtures/`.

Open `fixtures/stack-gpu-cpu-gpu.png` by eye. It must show blocky pixelation, then dithered noise, then a duotone color cast. If it looks identical to `fixtures/pixelate-default.png`, the CPU hop silently no-opped and the fixture is worthless.

- [ ] **Step 5: Re-run to confirm stability**

Run: `npm run test:browser`
Expected: PASS, 18 golden tests green.

- [ ] **Step 6: Add a combined test script**

In `package.json`, add:

```json
    "test:all": "npm run test && npm run test:browser",
```

- [ ] **Step 7: Run everything**

Run: `npm run test:all`
Expected: jsdom suite 40 files / 149 tests PASS, browser suite PASS. No regressions.

- [ ] **Step 8: Commit**

```bash
git add src/testing/effects.browser.test.ts fixtures/ package.json
git commit -m "test: add multi-effect stack goldens covering the CPU readback path"
```

---

## Done when

- `npm run test:all` is green.
- `fixtures/` holds 18 committed PNGs: 16 single-effect, 2 stack.
- Each golden has been visually confirmed to be plausible output, not a blank or duplicate frame.
- The native port repo can consume `fixtures/` and `src/testing/testImage.ts` (reimplemented in Zig) as its kernel-correctness oracle.

## Follow-on plans (not in scope here)

1. **Native vertical slice** — scaffold `dithrrd-native` with `native init --template ts-core --full`, prove Metal device + media-surface + `Cmd.request` wiring end-to-end with one GPU kernel and one diffusion kernel. Retires the ObjC-interop and host-command-registration risks.
2. **Catalog codegen + bulk kernel port** — Zig comptime catalog as source of truth, TS mirror generated, remaining 14 kernels ported against these goldens.
3. **App completeness** — palette editor, disk persistence, ImageIO open, native save dialog, drag-and-drop, menus.
