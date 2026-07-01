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

- Additional preset palettes and a community/shared palette import format.
- More matrix authoring (paint your own Bayer / clustered-dot matrix).
- Per-node blend modes / opacity between stack passes.
- Export presets (fixed dimensions, aspect crops) and metadata stamping.
- Undo/redo history panel with named checkpoints.
- Performance: WebGL → WebGPU compute path for GPU-side error diffusion (removes the
  CPU readback for those effects).
