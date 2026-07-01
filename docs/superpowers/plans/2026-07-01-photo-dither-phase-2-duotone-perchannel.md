# Photo Dither Customizer — Phase 2C: Duotone / Multitone + Per-Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two color/separation effects — a **Duotone / Multitone** effect that maps image luminance to a smooth color ramp (2 colors = duotone, N = multitone), reusing the existing palette system so any built-in or custom palette becomes a ramp; and a **Per-Channel** ordered-dither effect that dithers R/G/B independently at CMYK-style screen angles for a color-separation look.

**Architecture:** Both are additive `GpuEffect` modules registered in `EFFECT_LIST` (the Add menu auto-groups by `family`; `addNode` reads registry defaults — no UI/store changes). Duotone reuses the exact per-element `vec3` palette-uniform binding that `palette.ts` already uses (`uP0..uP15` + `uCount`), so this plan first **extracts** that binding into a shared helper (`paletteUniforms.ts`) and refactors `palette.ts` to use it, then duotone consumes the same helper. Per-channel is a self-contained ordered-dither shader.

**Tech Stack:** TypeScript, regl (WebGL2), GLSL ES 3.00, Vitest.

## Global Constraints

- **Package manager:** pnpm only. Focused test: `pnpm exec vitest run <file>`; full: `pnpm test`. Typecheck: `pnpm exec tsc -b`. Path alias `@/` → `src/`.
- **Effect model:** one file per effect exporting a `GpuEffect`; register by adding to `EFFECT_LIST` in `src/effects/registry.ts`. Controls render from the `controls` schema (`slider`, `select`, `toggle`, `angle`, `palette` are all supported).
- **Shaders:** GLSL ES 3.00 (`#version 300 es`, `precision highp float;`), inputs `in vec2 vUv`, output `out vec4 fragColor`, always-provided uniforms `sampler2D src` + `vec2 resolution`. **Preserve source alpha:** `fragColor.a` comes from `texture(src, …).a`, never hardcoded `1.0`.
- **`uniforms(params, ctx)` returned keys MUST equal `uniformKeys`** (each effect test asserts this).
- **Palette uniform binding:** regl binds array uniforms (`vec3[16]`) unreliably; palette-consuming effects declare 16 individual `uniform vec3 uP0..uP15` + `uniform int uCount` and unroll access. Do NOT reintroduce a `vec3[]` array uniform.
- **Palette colors:** `[r,g,b]` floats `0..1`; a palette lives in `ctx.palettes` keyed by id. Duotone reads `ctx.palettes[paletteId] ?? PALETTES.bw` (same fallback as `palette.ts`).
- **GPU-effect tests:** assert `uniforms()` key parity + param conversion (matching `palette.test.ts` / `bayer.test.ts` convention); shader visual correctness is checked by the Task 4 browser smoke.
- **Commits:** Conventional Commits, one per task.

---

## File Structure

```
src/effects/
  paletteUniforms.ts       # CREATE: shared palette->vec3 uniform helper (PALETTE_MAX, keys, binding)
  paletteUniforms.test.ts  # CREATE
  palette.ts               # MODIFY: reuse the shared helper (behavior unchanged)
  duotone.ts               # CREATE: GPU duotone/multitone (luma -> palette ramp), family 'color'
  duotone.test.ts          # CREATE
  perChannel.ts            # CREATE: GPU per-channel ordered dither, family 'ordered'
  perChannel.test.ts       # CREATE
  registry.ts              # MODIFY: register duotone + perChannel
```

Menu grouping is automatic: duotone joins the **Color** group (with Grade, Palette Map); perChannel joins the **Ordered** group (with Bayer, Clustered Dot). No `StackPanel.tsx` edit.

---

## Task 1: Extract shared palette-uniform helper; refactor palette.ts

Two effects now bind a palette as `uP0..uP15` + `uCount`. Extract that into one helper and refactor `palette.ts` to use it (identical behavior — `palette.test.ts` must stay green).

**Files:**
- Create: `src/effects/paletteUniforms.ts`, `src/effects/paletteUniforms.test.ts`
- Modify: `src/effects/palette.ts`

**Interfaces:**
- Consumes: `Palette` from `@/effects/types`.
- Produces:
  - `PALETTE_MAX = 16`
  - `paletteUniformKeys(): string[]` — returns `['uP0', …, 'uP15', 'uCount']`.
  - `paletteVec3Uniforms(palette: Palette): Record<string, unknown>` — returns `{ uCount, uP0..uP15 }`; `uCount = min(colors.length, 16)`; missing slots are `[0,0,0]`.
  - `PALETTE_GLSL_DECL: string` — the GLSL declaration lines for the 16 `uniform vec3 uP0..uP15;` + `uniform int uCount;` (so shaders share one declaration block).
  - `paletteRampGlsl(fnName: string): string` — GLSL for a `vec3 <fnName>(int idx)` function returning `uP<idx>` via an unrolled if-chain (used by duotone; palette.ts keeps its own nearest-match macro).

- [ ] **Step 1: Write the failing test**

Create `src/effects/paletteUniforms.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  PALETTE_MAX, paletteUniformKeys, paletteVec3Uniforms,
} from '@/effects/paletteUniforms'
import type { Palette } from '@/effects/types'

describe('paletteUniforms', () => {
  it('exposes 16 + count keys', () => {
    const keys = paletteUniformKeys()
    expect(keys).toHaveLength(PALETTE_MAX + 1)
    expect(keys).toContain('uP0')
    expect(keys).toContain('uP15')
    expect(keys).toContain('uCount')
  })
  it('binds colors to uP slots with uCount, padding missing slots with black', () => {
    const p: Palette = { id: 'x', name: 'x', colors: [[1, 0, 0], [0, 1, 0]] }
    const u = paletteVec3Uniforms(p) as Record<string, unknown>
    expect(u.uCount).toBe(2)
    expect(u.uP0).toEqual([1, 0, 0])
    expect(u.uP1).toEqual([0, 1, 0])
    expect(u.uP2).toEqual([0, 0, 0])
    expect(Object.keys(u).sort()).toEqual([...paletteUniformKeys()].sort())
  })
  it('clamps uCount to PALETTE_MAX', () => {
    const many: Palette = { id: 'y', name: 'y', colors: Array.from({ length: 20 }, () => [1, 1, 1] as [number, number, number]) }
    expect((paletteVec3Uniforms(many) as { uCount: number }).uCount).toBe(PALETTE_MAX)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/effects/paletteUniforms.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/effects/paletteUniforms.ts`:

```ts
import type { Palette } from '@/effects/types'

export const PALETTE_MAX = 16

export function paletteUniformKeys(): string[] {
  return [...Array.from({ length: PALETTE_MAX }, (_, i) => `uP${i}`), 'uCount']
}

export function paletteVec3Uniforms(palette: Palette): Record<string, unknown> {
  const u: Record<string, unknown> = { uCount: Math.min(palette.colors.length, PALETTE_MAX) }
  for (let i = 0; i < PALETTE_MAX; i++) {
    const c = palette.colors[i]
    u[`uP${i}`] = c ? [c[0], c[1], c[2]] : [0, 0, 0]
  }
  return u
}

/** GLSL declarations for the 16 individual palette vec3 uniforms + count. */
export const PALETTE_GLSL_DECL = `
uniform vec3 uP0; uniform vec3 uP1; uniform vec3 uP2; uniform vec3 uP3;
uniform vec3 uP4; uniform vec3 uP5; uniform vec3 uP6; uniform vec3 uP7;
uniform vec3 uP8; uniform vec3 uP9; uniform vec3 uP10; uniform vec3 uP11;
uniform vec3 uP12; uniform vec3 uP13; uniform vec3 uP14; uniform vec3 uP15;
uniform int uCount;`

/** GLSL: `vec3 <fnName>(int idx)` returning the idx-th palette color (unrolled). */
export function paletteRampGlsl(fnName: string): string {
  const lines = Array.from({ length: PALETTE_MAX }, (_, i) => `  if (idx <= ${i}) return uP${i};`)
  return `vec3 ${fnName}(int idx) {\n${lines.join('\n')}\n  return uP15;\n}`
}
```

- [ ] **Step 4: Refactor palette.ts to use it**

In `src/effects/palette.ts`: keep the shader's nearest-match logic and its `uP0..uP15`/`uCount` declarations (they already exist inline — leave the FRAG string as-is), but replace the local `MAX`, `PALETTE_KEYS`, and `paletteUniforms` with the shared helper. Concretely:

- Change the imports at the top to add: `import { paletteUniformKeys, paletteVec3Uniforms } from '@/effects/paletteUniforms'`.
- Delete the local `const MAX = 16`, `const PALETTE_KEYS = ...`, and the local `function paletteUniforms(...)`.
- Change `uniformKeys: [...PALETTE_KEYS, 'uCount'],` to `uniformKeys: paletteUniformKeys(),`.
- Change `uniforms: (p, ctx) => { const palette = ... ; return paletteUniforms(palette) }` to use `paletteVec3Uniforms(palette)`.

The FRAG constant, `type: 'palette'`, controls, and the `?? PALETTES.bw` fallback stay unchanged.

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm exec vitest run src/effects/paletteUniforms.test.ts src/effects/palette.test.ts src/effects/registry.test.ts`
Expected: PASS (palette.test.ts's key-parity + fallback tests still green — behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/effects/paletteUniforms.ts src/effects/paletteUniforms.test.ts src/effects/palette.ts
git commit -m "refactor: extract shared palette->vec3 uniform helper"
```

---

## Task 2: Duotone / Multitone effect (GPU)

Maps luminance to a smooth ramp across the selected palette's colors. 2-color palette → classic duotone; 3+ → tritone/multitone. Reuses the palette control (so the palette editor surfaces for it too) and the shared uniform helper.

**Files:**
- Create: `src/effects/duotone.ts`, `src/effects/duotone.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Consumes: `GpuEffect` (`@/effects/types`); `PALETTES` (`@/color/palettes`); `paletteUniformKeys`, `paletteVec3Uniforms`, `PALETTE_GLSL_DECL`, `paletteRampGlsl` (Task 1).
- Produces: `export const duotone: GpuEffect` — `type: 'duotone'`, `name: 'Duotone / Multitone'`, `family: 'color'`, `uniformKeys: paletteUniformKeys()`, control `{ type: 'palette', key: 'paletteId', label: 'Ramp' }`, `defaultParams: { paletteId: 'gameboy' }`.

- [ ] **Step 1: Write the failing test**

Create `src/effects/duotone.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { duotone } from '@/effects/duotone'
import { paletteUniformKeys } from '@/effects/paletteUniforms'

const ctx = { palettes: { bw: { id: 'bw', name: 'bw', colors: [[0, 0, 0], [1, 1, 1]] as [number, number, number][] } } }

describe('duotone effect', () => {
  it('is a color GPU effect', () => {
    expect(duotone.kind).toBe('gpu')
    expect(duotone.family).toBe('color')
    expect(duotone.type).toBe('duotone')
  })
  it('binds the selected palette to the declared uniform keys', () => {
    const u = duotone.uniforms({ paletteId: 'bw' }, ctx)
    expect(Object.keys(u).sort()).toEqual([...duotone.uniformKeys].sort())
    expect(duotone.uniformKeys).toEqual(paletteUniformKeys())
    expect((u as { uCount: number }).uCount).toBe(2)
  })
  it('falls back to a valid binding for an unknown palette id', () => {
    const u = duotone.uniforms({ paletteId: 'nope' }, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...duotone.uniformKeys].sort())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/effects/duotone.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement duotone.ts**

Create `src/effects/duotone.ts`:

```ts
import type { GpuEffect } from '@/effects/types'
import { PALETTES } from '@/color/palettes'
import {
  paletteUniformKeys, paletteVec3Uniforms, PALETTE_GLSL_DECL, paletteRampGlsl,
} from '@/effects/paletteUniforms'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
${PALETTE_GLSL_DECL}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

${paletteRampGlsl('rampAt')}

void main() {
  vec4 s = texture(src, vUv);
  int n = max(uCount, 2);
  float t = clamp(luma(s.rgb), 0.0, 1.0) * float(n - 1);
  int i0 = int(floor(t));
  i0 = clamp(i0, 0, n - 1);
  int i1 = min(i0 + 1, n - 1);
  float f = clamp(t - float(i0), 0.0, 1.0);
  vec3 col = mix(rampAt(i0), rampAt(i1), f);
  fragColor = vec4(col, s.a);
}`

export const duotone: GpuEffect = {
  kind: 'gpu',
  type: 'duotone',
  name: 'Duotone / Multitone',
  family: 'color',
  defaultParams: { paletteId: 'gameboy' },
  controls: [{ type: 'palette', key: 'paletteId', label: 'Ramp' }],
  frag: FRAG,
  uniformKeys: paletteUniformKeys(),
  uniforms: (p, ctx) => {
    const palette = ctx.palettes[String(p.paletteId)] ?? PALETTES.bw
    return paletteVec3Uniforms(palette)
  },
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/effects/duotone.test.ts`
Expected: PASS.

- [ ] **Step 5: Register**

Edit `src/effects/registry.ts` — add `import { duotone } from '@/effects/duotone'` and append `duotone` to `EFFECT_LIST`.

- [ ] **Step 6: Commit**

```bash
git add src/effects/duotone.ts src/effects/duotone.test.ts src/effects/registry.ts
git commit -m "feat: duotone/multitone effect (luminance -> palette ramp)"
```

---

## Task 3: Per-Channel ordered dither (GPU)

Dithers each RGB channel independently with an ordered (Bayer) threshold sampled at a per-channel rotated grid (classic CMY screen angles), producing a color-separation / rosette look. Controls: levels, base angle, dot scale.

**Files:**
- Create: `src/effects/perChannel.ts`, `src/effects/perChannel.test.ts`
- Modify: `src/effects/registry.ts`

**Interfaces:**
- Produces: `export const perChannel: GpuEffect` — `type: 'perChannel'`, `name: 'Per-Channel (CMYK)'`, `family: 'ordered'`, `uniformKeys: ['uLevels', 'uAngle', 'uScale']`, controls levels (2–8), angle, scale (1–8); `defaultParams: { levels: 2, angle: 0, scale: 1 }`.

- [ ] **Step 1: Write the failing test**

Create `src/effects/perChannel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { perChannel } from '@/effects/perChannel'

describe('perChannel effect', () => {
  it('is an ordered GPU effect', () => {
    expect(perChannel.kind).toBe('gpu')
    expect(perChannel.family).toBe('ordered')
    expect(perChannel.type).toBe('perChannel')
  })
  it('maps params to the declared uniform keys', () => {
    const u = perChannel.uniforms(perChannel.defaultParams, { palettes: {} })
    expect(Object.keys(u).sort()).toEqual([...perChannel.uniformKeys].sort())
  })
  it('converts the angle to radians and passes levels/scale through', () => {
    const u = perChannel.uniforms({ levels: 4, angle: 180, scale: 3 }, { palettes: {} }) as {
      uLevels: number; uAngle: number; uScale: number
    }
    expect(u.uLevels).toBe(4)
    expect(u.uScale).toBe(3)
    expect(u.uAngle).toBeCloseTo(Math.PI, 5)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/effects/perChannel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement perChannel.ts**

Create `src/effects/perChannel.ts`:

```ts
import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uLevels; uniform float uAngle; uniform float uScale;

const float BAYER4[16] = float[16](
  0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);

// Ordered threshold in -0.5..0.5 at integer grid position p.
float threshAt(vec2 p) {
  ivec2 q = ivec2(floor(p));
  int x = int(mod(float(q.x), 4.0));
  int y = int(mod(float(q.y), 4.0));
  return BAYER4[y * 4 + x] / 16.0 - 0.5;
}

vec2 rot(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c) * p;
}

float quant(float v, float t, float L) {
  v = clamp(v + t / (L - 1.0), 0.0, 1.0);
  return floor(v * (L - 1.0) + 0.5) / (L - 1.0);
}

void main() {
  vec4 s = texture(src, vUv);
  float L = max(uLevels, 2.0);
  vec2 p = (vUv * resolution) / max(uScale, 1.0);
  // classic screen angles offset per channel from the base angle
  float tr = threshAt(rot(p, uAngle + 0.2618));  // +15 deg
  float tg = threshAt(rot(p, uAngle + 1.3090));  // +75 deg
  float tb = threshAt(rot(p, uAngle));           //   0 deg
  vec3 c = vec3(
    quant(s.r, tr, L),
    quant(s.g, tg, L),
    quant(s.b, tb, L)
  );
  fragColor = vec4(c, s.a);
}`

export const perChannel: GpuEffect = {
  kind: 'gpu',
  type: 'perChannel',
  name: 'Per-Channel (CMYK)',
  family: 'ordered',
  defaultParams: { levels: 2, angle: 0, scale: 1 },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'angle', key: 'angle', label: 'Angle' },
    { type: 'slider', key: 'scale', label: 'Dot Scale', min: 1, max: 8, step: 1 },
  ],
  frag: FRAG,
  uniformKeys: ['uLevels', 'uAngle', 'uScale'],
  uniforms: (p) => ({
    uLevels: Number(p.levels),
    uAngle: (Number(p.angle) * Math.PI) / 180,
    uScale: Number(p.scale),
  }),
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/effects/perChannel.test.ts`
Expected: PASS.

- [ ] **Step 5: Register**

Edit `src/effects/registry.ts` — add `import { perChannel } from '@/effects/perChannel'` and append `perChannel` to `EFFECT_LIST`.

- [ ] **Step 6: Commit**

```bash
git add src/effects/perChannel.ts src/effects/perChannel.test.ts src/effects/registry.ts
git commit -m "feat: per-channel CMYK-style ordered dithering"
```

---

## Task 4: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full suite** — Run `pnpm test`. Expected: all pass (existing + new).
- [ ] **Step 2: Typecheck + build** — Run `pnpm exec tsc -b` (no errors) and `pnpm build` (succeeds).
- [ ] **Step 3: Manual smoke (report it)** — `pnpm dev`, open an image. Confirm the Add menu lists **Duotone / Multitone** under Color and **Per-Channel (CMYK)** under Ordered. Add Duotone: it maps the image to the selected palette's ramp; switching palettes (incl. a custom 3-color palette made in the palette editor) changes the ramp; the palette editor surfaces for it. Add Per-Channel: R/G/B separate into angled dot grids; levels/angle/scale respond. Transparent PNGs stay transparent; no console errors.

---

## Self-Review

**1. Spec coverage** (design spec "Duotone / multitone + per-channel: shadow→highlight ramps, and per-RGB-channel dithering with angle/offset for CMYK-style separation"):
- Duotone / multitone shadow→highlight ramp → Task 2 (luma mapped across the palette ramp; 2 colors = duotone, N = multitone). ✓
- Per-RGB-channel dithering with angle/offset for CMYK-style separation → Task 3 (independent per-channel Bayer thresholding at CMY screen angles + base angle + scale). ✓

**2. Placeholder scan:** No "TBD"/"implement later". Every step ships complete code (helper, two shaders, tests). Task 1's palette.ts refactor lists the exact deletions/replacements.

**3. Type consistency:** Both effects export `GpuEffect`. Duotone's `uniformKeys` = `paletteUniformKeys()` and `uniforms` returns `paletteVec3Uniforms()` — keys match by construction (asserted in the test). Per-channel keys `['uLevels','uAngle','uScale']` match its `uniforms()` return exactly. The shared helper's `PALETTE_GLSL_DECL`/`paletteRampGlsl('rampAt')` declare/define exactly the `uP*`/`uCount` names the uniforms bind.

**Known simplifications (documented, acceptable):**
- Per-channel screen angles are fixed offsets (+15°/+75°/0°) from a single base angle rather than three independent per-channel angle controls — keeps the control surface minimal while delivering the CMYK-separation look; independent per-channel angles can be added later if wanted.
- Duotone interpolates linearly in RGB across ramp stops (no gamma-correct blending) — matches the app's existing non-linear-space processing and the palette-map convention.
- palette.ts keeps its own nearest-match GLSL (it needs nearest, not a ramp); only the JS uniform binding + keys are shared. The `PALETTE_GLSL_DECL`/`paletteRampGlsl` helpers are consumed by duotone (and available to future ramp effects), not retrofitted into palette.ts's shader.
