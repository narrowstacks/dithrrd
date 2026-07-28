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

### Keyed effects give debouncing for free — but we no longer need them for rendering

`Cmd.request(name, payload, { key, ok, err })` reaches app-defined host commands from a TS core, and keyed effects carry one-in-flight discipline: a request whose key is already in flight replaces the previous one, with the superseded result dropped silently. That is slider-drag coalescing at the effect layer, and it was a significant argument for the TS core.

With a Zig core it no longer applies to rendering: `update` calls the pipeline directly, so there is no keyed effect in the render path and coalescing becomes the app's own concern. If rendering moves to a worker thread, `pushFrame`'s **latest-wins** contract provides the same guarantee at the frame level — a producer running faster than the display cannot build a backlog. The property survives; the mechanism changes.

The keyed-effect discipline remains available for genuine effects the Zig core issues through `fx` (file reads, timers).

### Free wins

- `src/primitives/canvas/png.zig` ships `writeRgba8` and `decodeRgba8`.
- `Cmd.readFile` / `Cmd.writeFile` cover palette persistence with no Zig.

## Architecture

**Core tier: Zig.** A TypeScript core was the original choice and is not buildable. `build/app.zig:499` panics when a tree carries both `src/core.ts` and `src/main.zig`: *"An app has exactly one core - the tree is the truth."* With a TS core the SDK generates its own entry point from `ts_core_main.zig` and there is no app-owned `main.zig`; other Zig files under `src/` are permitted but nothing links them, and setting a custom `main` path forces the build to skip the TypeScript transpile stage entirely. Since the Metal pipeline must run inside the update/frame loop and hold the runtime for `acquireMediaSurfaceProducer`, the core is Zig.

```
  src/main.zig         Zig core — Model, Msg, update(model, msg, fx).
       │                 Owns stack, params, palettes, surface id.
       │                 Calls the pipeline directly.
       ▼
  src/pipeline/*.zig   Metal — MTLDevice, MSL kernels, ping-pong MTLTextures
       │
       ├─ preview: readback ≤2MP ──► producer.pushFrame() ──► <media-surface>
       └─ export:  readback full ──► png.writeRgba8() ─────► disk
```

Boundaries:

- **`update` ↔ pipeline** is a direct Zig call. `update` receives `*Effects` as its third parameter, so effects and rendering are reachable from the same place.
- **Zig ↔ Metal** is internal to `pipeline/`. Nothing above it knows Metal exists.
- **Pixels never enter the model.** The model holds a `u64` surface id; frames go to the producer.

**The `wire` component is gone.** It existed only to marshal a render request across the TS→Zig boundary as `Cmd.request` bytes. With one language there is no boundary, no payload encoding, no result decoding, and no versioned wire format to keep in sync — a whole module and its round-trip tests disappear. This is the main consolation for losing the TS core.

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
  main.zig                 Model, Msg, update, wiring, producer lifecycle
  app.native               markup view
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

### codec

macOS ImageIO via Objective-C interop. Matches today's `accept="image/*"` behavior and handles JPEG, PNG, WebP, HEIC, TIFF. `png.decodeRgba8` alone would cover only PNG, and `Cmd.imageLoad` cannot be used because it deposits pixels in the SDK image registry behind the 1 MiB cap.

The ObjC interop cost is marginal because the Metal pipeline already requires it.

### catalog

The effect catalog (type, name, family, defaultParams, controls) lives in one place: a Zig comptime table. With a single tier there is no mirror to generate and no codegen step — the two-tier sync problem that made this a design question has disappeared along with the TS core. Adding an effect means editing one file because there is only one file.

### Ports that carry over nearly unchanged

- `plan.zig` from `src/engine/planPasses.ts`.
- `diffuse.zig` from `src/worker/algorithms.ts`: one driver plus six kernel tables.

### What porting `store.ts` to a Zig core involves

The TEA shape survives; the language does not:

- zustand actions become `Msg` union arms, and the store body becomes `update(model: *Model, msg: Msg, fx: *Effects)`.
- `update` mutates `*Model` in place rather than returning a new object — Zig cores mutate through the pointer, so the readonly-and-spread discipline the TS subset would have imposed does not apply.
- `sortable.ts`'s drag-reorder becomes index math in `update` rather than dnd-kit callbacks.
- Strings become Zig slices, which is ordinary rather than the `Uint8Array`-for-text constraint the TS subset carries.

Net: less awkward than the TS subset would have been, in a less familiar language.

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

**Stale frames cannot reach the screen.** With a Zig core there is no keyed render effect, so coalescing is not free at the effect layer. It is still free at the frame layer: `pushFrame` is latest-wins, so an unpresented staged frame is replaced by the next one and a producer running ahead of the display cannot build a backlog. The newest frame wins by construction.

## Testing

The SDK's deterministic reference renderer shows a placeholder for media surfaces, never producer frames — texture contents are presentation chrome by policy. Per the SDK docs: test the app with the toolkit's replay machinery, test the frames in your own pipeline. Testing splits accordingly.

### App logic

`update` is a plain function of model and message, so it is tested directly with `native test -Dplatform=null` — no window, no GPU. Today's `store.test.ts` and `sortable.test.ts` port across as ordinary Zig tests, since both already test pure state transitions.

(`native dev --core`, which runs a core under node dispatching `Msg`s as JSON lines, is a TypeScript-core facility and is not available here.)

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

Steps 1–3 are complete: see `docs/superpowers/plans/2026-07-27-golden-fixture-harness.md`. 18 goldens are committed in `fixtures/`.

**One property of those goldens is load-bearing for the port.** The 6 diffusion goldens encode error diffusion running in **GL bottom-up row order with inverted serpentine parity**, because rows stay in GL order through the CPU readback hop and are flipped to top-down only at the very end. This matches production web behaviour. A Metal implementation writing a top-down diffusion loop will mismatch every diffusion golden. Recorded in `fixtures/README.md`.

**Tolerance.** GLSL and MSL do not guarantee bit-identical float results. Ordered dithers and diffusion kernels quantize to discrete levels and should match exactly. Continuous-math effects (`grade`, `duotone`, `halftone` rotation) may differ in the last ulp. Goldens therefore compare with a per-pixel tolerance plus a max-delta ceiling, not byte equality. The six diffusion kernels are CPU-side in both worlds and get exact assertions.

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
