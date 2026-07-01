# Future Work & Non-Goals

Tracking things intentionally deferred from the initial build of the Photo Dither /
Diffusion Customizer. Nothing here is in scope for Phases 1–3 (see the
[design spec](specs/2026-07-01-photo-dither-customizer-design.md)); this document exists
so the decisions aren't lost.

## Non-Goals (deferred, with rationale)

- **SVG / vector export** — meaningful only for halftone / line-screen effects, and a
  significant amount of extra work (shape extraction, vector packing). Revisit if print
  output becomes a real need.
- **Node-graph editor** — a full node-based visual graph (TouchDesigner / Blender style).
  Overkill for the stated goal; the composable linear effect stack already delivers the
  needed flexibility. Revisit only if users hit real limits of the linear stack.
- **Cloud accounts / storage / sync** — the tool is fully client-side. Presets live in
  localStorage and share via URL. No backend, no auth. Revisit only if multi-device sync
  is genuinely wanted.
- **Mobile-first layout** — desktop-first (three-panel editor). Should remain usable /
  tolerable on smaller screens but is not optimized for touch or mobile. Revisit if
  mobile usage becomes a priority.
- **Video / GIF input** — image input only. Animated input (dithering video frames,
  exporting animated output) is a large separate effort. Revisit as its own project.

## Post-Phase-3 Ideas (nice-to-have, unscheduled)

These are candidate enhancements once the three planned phases land — not commitments.

- **Multi-document / tabbed editing** (Photoshop-style) — multiple photos open in one window,
  each as its own tab with independent effect stack, undo history, and zoom/pan state. The
  Phase 3 polish undo/redo is intentionally a single global document history (cleared on image
  load) so it can later become per-document without reworking the coalescing/partialize logic.
  See the [Phase 3 polish spec](specs/2026-07-01-photo-dither-phase-3-polish.md).
- Additional preset palettes and a community/shared palette import format.
- More matrix authoring (paint your own Bayer / clustered-dot matrix).
- Per-node blend modes / opacity between stack passes.
- Export presets (fixed dimensions, aspect crops) and metadata stamping.
- Undo/redo history panel with named checkpoints.
- Performance: WebGL → WebGPU compute path for GPU-side error diffusion (removes the
  CPU readback for those effects).
- Dynamic OG preview images for shared preset URLs, via a standalone Vercel serverless
  function (renders the shared look server-side for link unfurls) — no framework change
  needed.
