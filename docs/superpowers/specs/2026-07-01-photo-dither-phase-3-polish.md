# Photo Dither — Phase 3: Polish (undo/redo, keyboard shortcuts, panels, zoom/pan) — Design

**Date:** 2026-07-01
**Status:** Approved, ready for implementation planning
**Parent spec:** [Photo Dither / Diffusion Customizer — Design](2026-07-01-photo-dither-customizer-design.md)

## Purpose

Phase 3 of the design spec bundles three independent subsystems: **batch processing**,
**blue-noise / custom matrices**, and **polish (undo/redo, keyboard shortcuts)**. Following
the Phase 2 precedent, each is a separate spec → plan → build cycle. **This spec covers the
polish piece only**, expanded (with the user) to five cohesive UX improvements:

1. **Undo/redo** — history over the effect stack and palettes.
2. **Keyboard shortcuts** — a data-driven shortcut map for common actions.
3. **Collapsible side panels** — a distraction-free view (from the spec's UI section, never built).
4. **Keyboard-shortcuts help overlay** — a `?` cheat-sheet dialog.
5. **Zoom/pan viewport** — real zoom/pan (also never built; the canvas is currently plain
   `object-contain`), with macOS trackpad support.

Batch and custom-matrices are **out of scope** here and get their own specs.

## Guiding Principles (inherited)

- Minimal, readable UI; keyboard-first where sensible.
- Adding capability shouldn't bloat per-effect code — prefer one data-driven definition over
  bespoke wiring.
- Reuse the existing library stack; only add a dependency when it clearly beats hand-rolling.

## Current State (what exists today)

- **Store** (`src/store/store.ts`): a vanilla Zustand store holding `source`, `stack`,
  `selectedId`, `palettes`, `eyedropper`. Mutations: add/remove/toggle/reorder/duplicate node,
  `updateParam`, palette CRUD, eyedropper, `loadPreset`. Built-in palettes are guarded read-only.
- **AppShell** (`src/ui/AppShell.tsx`): three `ResizablePanel`s (stack / viewport / controls)
  from `react-resizable-panels`. No collapse.
- **Viewport** (`src/ui/Viewport.tsx`): a WebGL `<canvas>` sized to source dimensions, fit via
  CSS `object-contain`. **No zoom, no pan.** Has an eyedropper click→pixel mapping that assumes
  `object-contain` letterboxing.
- **Toolbar** (`src/ui/Toolbar.tsx`): Open image · Reset · Presets · Export PNG. No zoom controls
  despite the spec mockup showing "zoom · fit".

## New Dependencies

- **`zundo`** — temporal (undo/redo) middleware for Zustand (same ecosystem, ~700 bytes). Pin a
  version compatible with Zustand v5 (confirm during planning).
- **`react-zoom-pan-pinch`** — zero-dependency React zoom/pan/pinch, actively maintained. Handles
  trackpad pinch (the `ctrlKey`-on-wheel convention used by Figma/Excalidraw/tldraw), two-finger
  pan, wheel, and double-click; exposes an imperative API (`zoomIn`/`zoomOut`/`resetTransform`/
  `setTransform`/`centerView`) that our shortcuts and toolbar drive.

Both are standalone (neither hooks specially into regl/Zustand) but both are clean React-19 /
Vite fits. Alternatives (hand-rolled history array; `@use-gesture/react`; hand-rolled gestures)
were considered and rejected as more code for no benefit at this scope.

## 1. Undo/redo

**History model.** History tracks only the **document** = `{ stack, palettes }`. Excluded:
`source`, `selectedId`, `eyedropper`, and panel-collapse UI state. Loading a new source image
**clears history** (a new photo is a fresh start). Applying a preset (`loadPreset`) is a single
undoable step.

**Implementation — `zundo`.** Wrap the store's initializer in zundo's `temporal` middleware:

- **`partialize`** → snapshot only `stack` + `palettes`.
- **`handleSet` with a ~400ms debounce** → coalescing. Consecutive edits to the same target
  (a slider drag, hex typing) collapse into one undo step via a short idle gap. No per-effect
  wiring; the debounce is the entire coalescing mechanism.
- **`limit: 100`** → bound history depth / memory.
- Exposes `temporal.getState().undo()`, `.redo()`, `.clear()`, and `pastStates` / `futureStates`
  (used to enable/disable the toolbar undo/redo buttons).

**Wiring.**

- `⌘Z` → undo, `⌘⇧Z` → redo (also `Ctrl+Y` on Windows/Linux).
- `setSource` path calls `temporal.getState().clear()` for the fresh-start behavior.
- Toolbar gains Undo / Redo buttons, each disabled when its stack (`pastStates` / `futureStates`)
  is empty.

## 2. Keyboard shortcuts

**Single source of truth.** One `shortcuts` definition array (`{ id, keys, label, group, run }`)
drives BOTH the global key handler and the help overlay, so they cannot drift. `run` receives the
store / `temporal` / UI action handles.

**Confirmed map** (⌘ = `metaKey` on macOS, `ctrlKey` elsewhere):

| Action | Shortcut | Group |
|---|---|---|
| Undo | ⌘Z | Edit |
| Redo | ⌘⇧Z (also Ctrl+Y) | Edit |
| Delete selected node | Delete / Backspace | Stack |
| Duplicate selected node | ⌘D | Stack |
| Toggle selected node on/off | E | Stack |
| Select previous / next node | ↑ / ↓ | Stack |
| Open "add effect" menu | A | Stack |
| Export PNG | ⌘E | File |
| Collapse left / right panel | [ / ] | View |
| Zoom in / out | + / - | View |
| Fit to viewport | 0 | View |
| Zoom 100% | 1 | View |
| Show shortcuts help | ? (⇧/) | Help |

**Global handler.** A `useKeyboardShortcuts` hook mounted at `App` level attaches one
`keydown` listener and dispatches via the definition array.

**Focus guard.** Single-key shortcuts (E, A, ↑/↓, `[`, `]`, `?`, `+`, `-`, `0`, `1`) are
suppressed when the event target is an `input` / `textarea` / `contenteditable`, or when a modal
dialog is open. ⌘-combinations and Escape still fire. This keeps typing in hex/name fields safe.

**Help overlay.** A shadcn `Dialog` listing the table grouped by `group`, opened by `?` and by a
toolbar keyboard-icon button.

## 3. Collapsible side panels

- Enable `collapsible` + `collapsedSize` on the left (stack) and right (controls)
  `ResizablePanel`s, driven by imperative panel refs (`collapse()` / `expand()` / `isCollapsed()`).
- `[` toggles left, `]` toggles right; a chevron affordance on each resize handle does the same
  by click.
- Collapse state persists to `localStorage` as a UI preference. It is **not** part of undo history.

## 4. Keyboard-shortcuts help overlay

Covered by §2 (renders from the same `shortcuts` array). Called out separately only because it is
its own UI surface: a `Dialog` with grouped rows, platform-aware key glyphs (⌘ vs Ctrl), and a
toolbar trigger button in addition to the `?` shortcut.

## 5. Zoom/pan viewport

**Library.** `react-zoom-pan-pinch`. Wrap the canvas in `<TransformWrapper>` /
`<TransformComponent>`.

**Interaction model.**

- **Trackpad pinch** → zoom centered on the cursor (library handles the `ctrlKey`-on-wheel event).
- **Two-finger scroll** → pan.
- **Mouse wheel** → zoom on cursor when ⌘/Ctrl held, otherwise pan (a plain mouse wheel and a
  trackpad two-finger scroll are indistinguishable, so the modifier is the reliable zoom gesture).
- **Space + drag** / **middle-drag** → pan with the mouse.
- **Double-click** → reset/fit.
- **Keyboard** `+` / `-` zoom around center, `0` = fit-to-viewport, `1` = 100% — via the instance
  ref API (`zoomIn` / `zoomOut` / `centerView` / `setTransform`).

**Config.** Sensible min/max scale bounds; `image-rendering: pixelated` when scale > 100% so
dithered output stays crisp when zoomed in.

**Toolbar.** A zoom-% indicator and a Fit button (both also reachable by keyboard).

**Eyedropper fix (required).** The current click→source-pixel mapping assumes `object-contain`
letterboxing. Rewrite it to invert the library's active transform (scale + translate) from the
instance state before computing the source pixel, so the eyedropper stays accurate at any
zoom/pan. This is the one existing behavior the zoom/pan work must not regress.

## Module Boundaries & Files

- `store/` — wrap initializer in zundo `temporal`; add `temporal` access + a `clearHistory` call
  on source change. Undo/redo actions live on the temporal store, not duplicated into `AppState`.
- `ui/shortcuts.ts` (new) — the `shortcuts` definition array (single source of truth).
- `ui/useKeyboardShortcuts.ts` (new) — the global handler hook + focus guard.
- `ui/ShortcutsDialog.tsx` (new) — the help overlay, rendered from `shortcuts`.
- `ui/AppShell.tsx` — collapsible panels + imperative refs; expose collapse toggles.
- `features/panelState.ts` (new) — localStorage persistence for collapse prefs (pure helpers).
- `ui/Viewport.tsx` — `TransformWrapper`/`TransformComponent`; expose transform ref; rewrite
  eyedropper mapping.
- `ui/Toolbar.tsx` — Undo/Redo buttons, zoom-% indicator + Fit button, shortcuts-help button.
- `features/viewportMath.ts` (new) — pure inverse-transform helper for eyedropper (unit-testable).

Keep files focused; if `Viewport.tsx` grows unwieldy, split the transform/eyedropper logic into a
child or hook.

## Error Handling

- **zundo × Zustand v5 incompatibility** — caught at planning via a version pin; if the middleware
  can't wrap the vanilla store cleanly, fall back to a hand-rolled history array (documented as the
  rejected alternative). This is the only real integration risk.
- **Shortcut conflicts with browser** — avoid browser-hijacked combos (no ⌘S; export is ⌘E).
  `preventDefault` only for combos we own.
- **Zoom/pan + eyedropper drift** — mitigated by the inverse-transform rewrite and its unit tests.

## Testing Strategy

- **Unit (pure functions):**
  - zundo config: `partialize` selects exactly `{ stack, palettes }`; a rapid burst of edits
    coalesces to one history entry after the debounce; `limit` caps depth.
  - shortcut dispatch: a `keydown` descriptor maps to the right action id; focus guard suppresses
    single-key shortcuts on input targets but not ⌘-combos.
  - `viewportMath` inverse transform: known (scale, translate) + client point → correct source
    pixel, including out-of-bounds rejection.
  - `panelState` persistence round-trip.
- **Component (Testing Library):** toolbar Undo/Redo enable/disable from `pastStates`/`futureStates`;
  help dialog opens on `?` and lists all groups; collapse toggles flip panel state.
- **Smoke / manual:** trackpad pinch, two-finger pan, wheel+modifier zoom, space-drag — verified in
  the running app (library-driven gesture behavior is not unit-tested).

## Out of Scope / Deferred

- **Batch processing** and **blue-noise / custom matrices** — separate Phase 3 specs.
- **Multi-document / tabbed editing** (Photoshop-style: multiple photos open in one window, each a
  tab). A natural future home for *per-document* undo history and per-document zoom state. Recorded
  in [future-work](../future-work.md); explicitly not built here. The undo/redo design (single
  global document history, cleared on image load) is deliberately simple so it can later become
  per-document without rework of the coalescing/partialize logic.

## Non-Goals

Inherited from the [parent spec](2026-07-01-photo-dither-customizer-design.md) and
[future-work](../future-work.md): SVG/vector export, node-graph editor, cloud accounts/storage,
mobile-first layout, video/GIF input.
