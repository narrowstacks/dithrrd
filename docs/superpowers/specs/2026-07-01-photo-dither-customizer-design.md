# Photo Dither / Diffusion Customizer — Design

**Date:** 2026-07-01
**Status:** Approved, ready for implementation planning

## Purpose

A browser-based tool for turning photos into dithered / pixelated / halftoned art.
Built primarily for personal use (making dithered art from my own photos) but designed
as a genuinely useful, highly customizable tool for anyone. Fully client-side, no backend.

## Guiding Principles

- **Highly customizable** — a composable stack of effects with rich, per-effect controls.
- **Performant** — real-time (target 60fps) preview via GPU shaders, even on large images.
- **Extensible by design** — adding a new effect or palette is adding one data file.
- **Minimal, readable UI** — no gradients or decorative flourishes. A mostly neutral,
  near-monochrome surface. Color is used sparingly but meaningfully: the photo and the
  palette swatches should be the only saturated things on screen; accents mark active
  state and the primary action only.

## Tech Stack

- **pnpm** — package manager (all scripts and installs use pnpm).
- **Vite + React + TypeScript** — app shell and build. Deployed to **Vercel as static
  output** (no server). Vite is chosen over Next.js deliberately: this is a 100%
  client-side WebGL editor, so SSR adds no value while actively fighting browser-only
  libraries (regl/WebGL2/canvas/Web Workers all require `window`). Server-side features
  we might want later (e.g. dynamic OG preview images for shared preset URLs) can be
  added as standalone Vercel serverless functions without adopting Next.
- **Tailwind CSS + shadcn/ui** — all interface components.
- **regl** — functional WebGL2 wrapper for the multi-pass shader pipeline (chosen for
  clean, declarative ping-pong render targets and low overhead).
- **Zustand** — lightweight state for a settings-heavy app.
- **Web Worker (CPU)** — serial error-diffusion algorithms that GPUs can't do well.
- **jszip** — batch export packaging (Phase 3).

## Architecture

The app is a **render graph, not a screen.** Everything visible is a projection of two
pieces of state:

1. **The source image** — uploaded, decoded to a GPU texture once.
2. **The effect stack** — an ordered, reorderable list of effect nodes, each with a
   `type` and a `params` object.

A single **render engine** walks the stack top-to-bottom, running each enabled node as
one or more regl shader passes, ping-ponging between two framebuffers. The final pass
draws to the visible canvas. Changing any param re-runs the chain for a live preview.
The **same engine** renders off-screen at full resolution for PNG export (identical
passes, larger framebuffers).

### Module boundaries

Each module has one clear purpose, a well-defined interface, and is testable in isolation.

- `engine/` — regl setup, framebuffer ping-pong, the pass runner. Knows nothing about
  React or specific effects. Interface: `render(source, stack, target) -> framebuffer/canvas`.
- `effects/` — a registry. Each effect = `{ id, name, family, defaultParams,
  controlsSchema, passes[], cpu? }`. Adding an effect = adding one file.
- `color/` — palettes, palette-editor logic, duotone/quantize helpers shared as shader
  uniforms. Palettes are reusable entities referenced by id, independent of any effect.
- `worker/` — error-diffusion (Floyd–Steinberg etc.) on the CPU, off the main thread.
- `store/` — Zustand: source image, effect stack, palettes, presets, UI state.
- `ui/` — shadcn components: stack panel, per-node control panels, canvas viewport,
  toolbar, export/batch dialogs.

### Effect stack & control model

Each effect node is a plain data object. A **controls schema** describes its params
(`slider`, `select`, `toggle`, `color`, `palette`, `angle`), and the UI auto-generates
control panels from that schema — no bespoke UI per effect. Nodes can be toggled,
reordered by drag, duplicated, and removed. The stack serializes to JSON; that JSON is
the unit saved as a preset and encoded into a share URL.

### Error-diffusion handling (the one non-GPU path)

Error-diffusion is inherently serial and awkward on WebGL. Such nodes are marked
`cpu: true`. When the engine reaches one, it reads back the current framebuffer, hands
the pixels to the Web Worker, and uploads the result as a texture to continue the chain.
Everything else stays on GPU. During live scrubbing the CPU pass may be debounced /
downscaled; export always runs it at full quality.

## Effect Catalog

Organized by family. **Bold = included in the Phase 1 vertical slice.**

- **Ordered / Bayer:** **Bayer 4×4 / 8×8 threshold dithering** (matrix size, threshold,
  contrast) → clustered-dot, blue-noise, custom matrices.
- **Error diffusion (CPU/Worker):** **Floyd–Steinberg** (serpentine toggle, diffusion
  strength) → Atkinson, Jarvis, Stucki, Sierra, Burkes.
- **Halftone / patterns:** **Circular halftone** (dot size, angle, frequency) → line
  screen, crosshatch, CMYK-angled separations.
- **Pixelation / quantize:** **Pixelate + posterize** (pixel size, color levels, gamma)
  → downsample sampling modes, dither-before-quantize option.

Each family ships one strong effect in the slice so all four are represented end-to-end;
breadth is added file-by-file via the registry afterward.

## Color System

A shared color capability that any node can invoke via uniforms:

- **Pre-process grade** (an early node): brightness, contrast, gamma, saturation, hue,
  plus threshold/levels. Applied before dithering to dial in source tone.
- **Palette mapping:** mono, grayscale-N, and preset palettes (Game Boy, CGA, PICO-8,
  C64, e-ink, riso inks).
- **Custom palette editor:** add/remove/reorder swatches, hex entry or eyedropper from
  the image, save named palettes to localStorage, import/export.
- **Duotone / multitone + per-channel:** shadow→highlight ramps, and per-RGB-channel
  dithering with angle/offset for CMYK-style separation.

Palettes are reusable entities referenced by id, so a palette lives independently of the
effect that uses it.

## UI Layout

A calm, standard three-region editor. The photo dominates; controls stay out of the way.

```
┌──────────────────────────────────────────────────────────┐
│  toolbar:  [logo]   file · reset      zoom · fit · export  │  ← thin, neutral
├────────────┬─────────────────────────────────┬────────────┤
│ EFFECT     │                                 │ CONTROLS   │
│ STACK      │                                 │ (selected  │
│            │        photo preview            │  node's    │
│ + add ▾    │        (checkerboard bg,        │  params,   │
│ ▸ Grade    │         fit-to-viewport)        │  auto-gen  │
│ ▸ Pixelate │                                 │  from      │
│ ▸ Bayer  ● │                                 │  schema)   │
│ ▸ Palette  │                                 │            │
│  drag ⋮⋮⋮   │                                 │ palette &  │
│            │                                 │ presets    │
└────────────┴─────────────────────────────────┴────────────┘
```

- **Left:** the effect stack — drag to reorder, toggle dot, click to select, `+ add`
  menu grouped by family.
- **Center:** live preview on a subtle checkerboard, fit-to-viewport with zoom/pan.
- **Right:** auto-generated controls for the selected node; the palette editor surfaces
  here when a palette-aware node is selected.
- Collapsible side panels for a distraction-free view. Keyboard-first where sensible
  (delete node, toggle, undo/redo).
- shadcn components: `Resizable`, `ScrollArea`, `Slider`, `Select`, `Popover`, `Dialog`,
  `Tabs`, plus `Button`, `Toggle`, `Tooltip`.

## Export, Presets & Batch

- **Export (Phase 1):** off-screen render of the stack at source resolution (or ×1/×2/×4
  multiplier), download PNG. A progress state, since full-res + CPU passes take a beat.
- **Presets (Phase 2):** stack + referenced palettes serialize to JSON → save named
  presets to localStorage, export/import as a file, and encode into a shareable URL
  (compressed query param). Loading a URL rebuilds the exact look.
- **Batch (Phase 3):** drop multiple photos → apply the current stack to each → render
  off-screen → download a zip, with a queue + progress list. Reuses the same engine
  per image.

## Error Handling

- **Image decode failures** (unsupported/corrupt file) → surface a clear inline error,
  keep prior image.
- **WebGL2 unavailable** → detect on startup, show a blocking, explanatory message
  (the tool requires WebGL2).
- **Texture size limits** → clamp/warn when a source exceeds `MAX_TEXTURE_SIZE`;
  downscale the working texture for preview, keep full res for export where feasible.
- **Worker failures** (error-diffusion) → fall back to skipping that node with a visible
  warning rather than crashing the chain.
- **Export/batch failures** → per-item error reporting in the queue; one failure does
  not abort the batch.

## Testing Strategy

- **Unit:** effect registry integrity (every effect has valid schema + defaults),
  color/palette helpers, stack serialization round-trip (JSON ↔ stack ↔ URL).
- **Worker:** error-diffusion algorithms against known small fixtures (deterministic
  pixel output for a given input + matrix).
- **Engine:** render a known 2×2 / 4×4 input through single passes and assert output
  pixels (headless WebGL where practical) for the deterministic (ordered) effects.
- **UI:** schema-driven control generation renders the right control per param type;
  stack operations (add/reorder/toggle/duplicate/remove) mutate state correctly.

## Build Phasing

- **Phase 1 — vertical slice:** full architecture + engine + shadcn shell; one effect per
  family (Bayer, Floyd–Steinberg, circular halftone, pixelate+posterize); pre-process
  grade; palette mapping + one preset palette; PNG export. A genuinely usable tool.
- **Phase 2:** custom palette editor; duotone / per-channel; remaining effects per
  family; preset save/load + URL share.
- **Phase 3:** batch processing; blue-noise / custom matrices; polish (undo/redo,
  keyboard shortcuts).

## Non-Goals

See [the future-work document](../future-work.md) for the full list and rationale.
Current non-goals: SVG/vector export, node-graph editor, cloud accounts/storage,
mobile-first layout (desktop-first, responsive-tolerable), video/GIF input.
