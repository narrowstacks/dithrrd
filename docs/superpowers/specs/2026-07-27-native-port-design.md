# dithrrd native port — design

Date: 2026-07-27
Status: approved, ready for implementation planning
Target: new repo (`dithrrd-native`), macOS first

## Goal

Port dithrrd to a native macOS app built on the [Vercel Native SDK](https://github.com/vercel-labs/native), driven by three motivations, in order:

1. Reduce latency when re-rendering multi-effect stacks on large images.
2. Make it a real Mac app: native menus, file dialogs, drag-and-drop.
3. Learn Zig and the Native SDK. This is a stated goal, not a cost to minimize.

## Findings that constrain the design

All verified against the SDK at v0.6.1 (released 2026-07-26).

### The SDK cannot run custom shaders

`src/primitives/canvas/gpu.zig` defines a closed command set:

```zig
pub const CanvasGpuCommandKind = enum {
    fill_rect_solid, fill_rect_gradient, fill_rounded_rect_solid,
    fill_rounded_rect_gradient, stroke_rect_solid, stroke_rect_gradient,
    draw_line_solid, draw_line_gradient, fill_path, stroke_path,
    draw_image, draw_text, shadow, blur, unsupported,
};

pub const CanvasGpuEffect = union(enum) { none, shadow: CanvasGpuShadow, blur: CanvasGpuBlur };
```

`VisualEffectKind` in `render_effects.zig` is likewise `{ shadow, blur }`. The repo contains no `.metal` files and no custom render-pass hook. The `extensions` API (`src/extensions/root.zig`) provides runtime lifecycle hooks (`start_fn`, `command_fn`), not render hooks.

`gpu_surface` is the surface the SDK's own UI renderer paints widgets onto. It is not a programmable canvas. Adding a shader stage would mean forking `src/primitives/canvas/` and the Metal host, which is toolkit contribution against a pre-1.0 API, not app development.

**Consequence:** dithrrd owns its own `MTLDevice` and Metal pipeline. The SDK owns the UI.

### `media-surface` is the viewport primitive

Two ways to get pixels on screen:

- `registerCanvasImage(id, width, height, rgba8)` — capped at `max_registered_canvas_image_pixel_bytes = 1 MiB` (512×512 RGBA) with 16 slots (`src/runtime/canvas_limits.zig:105-106`). Too small.
- `MediaSurfaceProducer.pushFrame(width, height, rgba8)` (`src/runtime/media_surface.zig:280`) — built for compositing an external renderer into the layout. Latest-wins, damage-tracked, any-thread, and pushing is waking. Capped at `max_media_surface_pixel_bytes = 8 MiB`, roughly 2 MP.

The 2 MP cap forces a preview/export split, which is the architecture image editors already use and is where the latency win comes from.

### `Cmd.request` gives render debouncing for free

App-defined host commands are reachable from a TS core via `Cmd.request(name, payload, { key, ok, err })`. Keyed effects carry one-in-flight discipline: a request whose key is already in flight replaces the previous one and the superseded result is dropped silently. That is exactly slider-drag coalescing, handled at the effect layer.

### Free wins

- `src/primitives/canvas/png.zig` ships `writeRgba8` and `decodeRgba8`.
- `Cmd.readFile` / `Cmd.writeFile` cover palette persistence with no Zig.

## Architecture

```
  src/core.ts          TS core (app-core subset) — Model, Msg, update.
       │                 Owns stack, params, palettes, surface id.
       │  Cmd.request("dither.render", …, { key: RENDER })
       ▼
  src/host.zig         Zig host commands — decode params, drive pipeline,
       │                 wrap platform dialogs.
       ▼
  src/pipeline/*.zig   Metal — MTLDevice, MSL kernels, ping-pong MTLTextures
       │
       ├─ preview: readback ≤2MP ──► producer.pushFrame() ──► <media-surface>
       └─ export:  readback full ──► png.writeRgba8() ─────► disk
```

Boundaries:

- **TS ↔ Zig** via one keyed `Cmd.request` per render. `ok` returns dimensions and timing; `err` returns a machine-readable reason.
- **Zig ↔ Metal** is internal to `pipeline/`. Nothing above it knows Metal exists.
- **Pixels never enter TS.** The core holds a `u64` surface id and never touches image bytes, which is what keeps it inside the app-core subset.

### Mapping from today's engine

`planPasses` and the `PassStep[]` model survive intact. Only the backend changes.

| Today | Native |
|---|---|
| `regl.framebuffer` ping-pong | `MTLTexture` ping-pong pool |
| `#version 300 es` fragment shader | `.metal` compute kernel |
| `backend.readback()` per CPU effect | eliminated for all-GPU runs |
| `runCpu` → worker `postMessage` | in-process Zig, preview resolution only |
| `canvas.toBlob` | `png.writeRgba8` |

### Where the latency actually goes

Today `src/engine/execute.ts:19-24` does a full-resolution `glReadPixels` plus a worker round trip for every CPU effect in the stack. The existing working-size cap is `MAX_WORKING_EDGE = 4096` (`src/features/image.ts:2`), so that is up to ~16 MP per hop.

In the new design:

- All-GPU stacks have zero intermediate readbacks.
- Diffusion effects mid-stack still force GPU→CPU→GPU. This does not disappear. What changes is that during interaction the round trip is ≤2 MP in native code rather than up to 16 MP through `postMessage`, and the kernel itself is native rather than JS.
- Full-resolution cost is paid once, at export.

## Scope

### In for v1

- All 16 effects: 10 MSL compute kernels, 6 CPU diffusion kernels in Zig.
- Reorderable effect stack.
- Palette editor with built-in and custom palettes, persisted to disk.
- Image open via native dialog and drag-and-drop.
- PNG export via native save dialog.

### Out for v1

- Presets (save/load/delete). Deferred. Note that custom palettes already require the persistence layer, so only the preset feature defers, not the storage work.
- `?p=` share URLs. Meaningless on desktop; drop rather than port.
- Zoom to 100% on images above the preview cap. Would require tiling. Preview contract for v1 is fit-to-viewport.

## Components

```
app.zon                    manifest: window, capabilities, assets
src/
  core.ts                  Model, Msg, update
  app.native               markup view
  wire.ts / wire.zig       render-request codec
  host.zig                 Cmd.request handlers, dialog wrappers
  codec.zig                image decode → RGBA8 (ImageIO)
  catalog.zig              effect catalog, comptime, source of truth
  pipeline/
    device.zig             MTLDevice, queue, texture pool
    plan.zig               port of planPasses.ts
    execute.zig            chain runner
    kernels.metal          the 10 shader effects
    diffuse.zig            the 6 serial kernels + kernel tables
    export.zig             full-res run → png.writeRgba8
```

### wire

New. `Cmd.request` marshals a `Uint8Array`, so the render request (effect stack, per-effect params, active palette) needs an explicit versioned encoding, written twice and tested as a pair. It is the contract the whole app rides on, so it gets its own module and round-trip tests rather than being spread across `core.ts` and `host.zig`.

Payload carries: format version byte, working dimensions, preview flag, ordered effect list with per-effect params, and the active palette's colors.

### codec

macOS ImageIO via Objective-C interop. Matches today's `accept="image/*"` behavior and handles JPEG, PNG, WebP, HEIC, TIFF. `png.decodeRgba8` alone would cover only PNG, and `Cmd.imageLoad` cannot be used because it deposits pixels in the SDK image registry behind the 1 MiB cap.

The ObjC interop cost is marginal because the Metal pipeline already requires it.

### catalog

The effect catalog (type, name, family, defaultParams, controls) must exist in both tiers. The Zig comptime table is the source of truth; the TS mirror is generated from it at build time via a step in `build.zig`. Adding an effect means editing one file. Drift is impossible, which matters because the wire format makes silent drift a runtime bug.

### Ports that carry over nearly unchanged

- `plan.zig` from `src/engine/planPasses.ts`.
- `diffuse.zig` from `src/worker/algorithms.ts`: one driver plus six kernel tables.

### What core.ts gives up

The app-core subset changes `store.ts`'s shape more than it appears:

- Strings become `Uint8Array` (palette names, effect ids).
- All model fields become `readonly`; every mutation is a spread.
- zustand actions become `Msg` arms.
- `sortable.ts`'s drag-reorder becomes index math in `update` rather than dnd-kit callbacks.

## Error handling

Governing rule is the SDK's store-on-success discipline: `update` writes model state only on an `ok` arm. A failed render leaves the last good frame on screen and sets a status line. It never blanks the viewport.

| Failure | Source | Handling |
|---|---|---|
| `decode_failed` / `unsupported` | ImageIO rejects the file | status line, keep current image |
| `FrameTooLarge` | preview above 8 MiB | should be unreachable given fit-to-viewport; assert rather than recover |
| `MediaSurfaceInUse` | producer double-acquired | startup bug, fail loudly |
| `MediaSurfaceReleased` | push after teardown | expected during shutdown, ignore |
| `write_failed` | export to disk | dialog, keep the image |
| Save dialog cancelled | user | not an error: no status, no message |

Two decisions:

**MSL compiles to a `.metallib` at build time.** A kernel that does not compile breaks `zig build` rather than failing on first slider drag. This is strictly better than today, where a malformed GLSL string fails at draw time.

**Cancellation needs no code.** Because renders are keyed, a superseded request is dropped by the runtime with no message. The newest render wins by construction, so there is no stale-frame race to reason about.

## Testing

The SDK's deterministic reference renderer shows a placeholder for media surfaces, never producer frames — texture contents are presentation chrome by policy. Per the SDK docs: test the app with the toolkit's replay machinery, test the frames in your own pipeline. Testing splits accordingly.

### App logic

`native dev --core` runs the TS core under node, dispatching `Msg`s as JSON lines. Today's `store.test.ts` and `sortable.test.ts` port directly, since both already test pure state transitions.

### Pixels

The existing tests are only a partial oracle, and the split matters:

- **The 6 CPU diffusion effects are covered.** `src/worker/algorithms.test.ts` runs real pixel math and is a genuine behavioural oracle today.
- **The 10 GPU effects are not.** `src/effects/*.test.ts` asserts only params-to-uniform mapping (see `bayer.test.ts`); the GLSL is never executed. There are no pixel expectations to harvest.

Goldens for the GPU effects therefore have to be **created**, not extracted, and that requires executing WebGL2 shaders — which jsdom cannot do. A browser-backed test runner (`@vitest/browser` + Playwright, real Chromium) is a prerequisite.

Sequence:

1. In the existing repo, add a browser-mode test runner and a headless render harness over the real regl backend.
2. Generate PNG goldens for all 16 effects from a procedurally-generated source image, plus at least one multi-effect stack.
3. Commit the goldens and assert against them, which also gives the current web app pixel-regression coverage it lacks.
4. Port each Metal kernel until it reproduces its golden.

Step 1–3 are work in the *current* repo and are worth doing on their own merits, independent of whether the port proceeds.

**Tolerance.** GLSL and MSL do not guarantee bit-identical float results. Ordered dithers and diffusion kernels quantize to discrete levels and should match exactly. Continuous-math effects (`grade`, `duotone`, `halftone` rotation) may differ in the last ulp. Goldens therefore compare with a per-pixel tolerance plus a max-delta ceiling, not byte equality. The six diffusion kernels are CPU-side in both worlds and get exact assertions.

### wire

Round-trip property tests in both directions, run in both tiers.

### UI flows

`native automate record/replay`, which snapshots the semantic tree (surface geometry and labels, no pixels) and stays honest about what it verifies.

## Risks

- **macOS only, structurally.** Two independent reasons, not one. The pipeline is Metal, and the SDK itself states that GPU hosts composite media-surface textures while software hosts render the placeholder — so on the Linux and Windows software renderers the viewport would show a placeholder rather than the image. Cross-platform is not a later flag flip; it needs a second backend and a GPU host on those platforms. v1 is macOS, deliberately.
- **Pre-1.0 SDK.** v0.6.1 shipped the day before this design. The docs state APIs still move. Pin the SDK version and expect churn on upgrade.
- **media-surface is the newest surface in the toolkit.** The 8 MiB cap and RGBA8-only format are current-release limits; the docs list zero-copy GPU handles as planned. If those land, the final preview readback disappears for free.
- **ObjC interop volume.** Metal plus ImageIO is a meaningful amount of interop for a first Zig project. This is acceptable given that learning Zig is an explicit goal, but it is the most likely source of schedule slip.
- **Diffusion mid-stack still costs a round trip.** The design reduces its size, not its existence.

## Alternatives rejected

- **Pure SDK with a CPU pixel pipeline.** Converting 10 working GPU shaders into CPU passes is a plausible performance regression on exactly the large-image stacks that motivated the port.
- **Pure Metal app, no SDK.** Fastest and architecturally simplest (zero-copy to screen, no final readback), but drops the SDK entirely and with it one of the three stated motivations.
- **WebView shell hosting the existing Vite app.** Viable and cheap, and the SDK supports it via `native init --frontend vite` with ~46 lines of Zig. Delivers native chrome but no performance change, since the render path stays WebGL2 in WKWebView. Worth revisiting if the native port stalls.
