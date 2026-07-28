# Native Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the dithrrd native architecture end to end in a new repo — one GPU effect and one CPU diffusion effect rendering a real image through a Metal pipeline into a live `media-surface`, driven by a slider — and retire every load-bearing unknown before the remaining 14 kernels are written.

**Architecture:** A Zig-core Native SDK app. `src/main.zig` owns `Model`, `Msg`, and `update`; `src/pipeline/` owns an app-created `MTLDevice`, MSL compute kernels, and a texture pool. Rendered RGBA is pushed to a `media-surface` widget via `runtime.acquireMediaSurfaceProducer(...).pushFrame(...)`. The SDK renders all UI; it never touches the image pixels.

**Tech Stack:** Zig 0.16, Native SDK 0.6.1, Metal (MSL compute), macOS ImageIO via Objective-C interop, `native` CLI.

## This is a spike plan, not a transcription plan

Unlike the golden-fixture plan, most tasks here are **experiments with pass/fail gates**, not code to copy. The exact shape of Metal-from-Zig interop and the runtime accessor for media producers are not knowable from the SDK docs — determining them IS the work. Every task therefore states:

- the exact API surface to target (verified against SDK source, cited),
- a concrete verification command with an unambiguous pass condition,
- what to do if it fails, including when to stop.

A task that cannot meet its gate is a finding, not a failure. Report it and stop rather than working around it — the entire point of a slice is to learn this cheaply.

## Global Constraints

- **New repo**, separate from `dithrrd`. Suggested name `dithrrd-native`.
- **macOS only.** The pipeline is Metal, and the SDK composites `media-surface` textures only on GPU hosts — Linux/Windows software renderers show a placeholder. Not a later flag flip.
- **Zig core.** `src/main.zig` and `src/core.ts` cannot coexist: `build/app.zig:499` panics with *"this app declares two cores… An app has exactly one core - the tree is the truth."* Other Zig files under `src/` are fine.
- **Native SDK 0.6.1**, pinned. Pre-1.0; APIs move.
- **Zig 0.16.0 exactly.** The `native` CLI will download the pinned toolchain to `~/.native/toolchains/` if the system Zig is incompatible.
- **Media surface frames are capped at `max_media_surface_pixel_bytes = 8 MiB`** (`src/runtime/canvas_limits.zig:131`), roughly 2 MP. Preview renders must fit; export never goes through media-surface.
- **Frames must be tightly-packed straight-alpha RGBA8.** Not BGRA, not premultiplied.
- Surface ids are model-owned `u64`, nonzero, below bit 63 (bit 63 is the toolkit's reserved texture namespace).
- Goldens from the `dithrrd` repo (`fixtures/*.png`, 256×256) are the correctness oracle. **Diffusion goldens encode bottom-up scan order with inverted serpentine parity** — see `fixtures/README.md` in that repo. A top-down Metal diffusion loop will mismatch every one.

## Reference material

A scaffolded Zig-core app already exists at `/private/tmp/claude-501/-Users-aaron-workspace-dithrrd/e86aa285-5782-4d25-86fe-286cdf0bf517/scratchpad/zig-probe/`. It is the canonical shape: `src/main.zig` (148 lines), `src/app.native`, `src/tests.zig`, `app.zon`, `build.zig`. Read it before Task 1. If it has been cleaned up, regenerate with `native init zig-probe --template zig-core --full`.

Verified API facts this plan depends on, each cited so an implementer can re-check:

| Fact | Source |
|---|---|
| `update(model: *Model, msg: Msg, fx: *Effects)` — `fx` handed directly to update | `zig-probe/src/main.zig` |
| `UiApp.Options.on_frame: ?*const fn (model: *const ModelT, frame: platform.GpuFrame) ?MsgT` | `src/runtime/ui_app.zig:653` |
| `Runtime.acquireMediaSurfaceProducer(surface_id: u64) anyerror!MediaSurfaceProducer` — **loop-thread-only** | `src/runtime/media_surface.zig:409`, thread contract at `:18` |
| `MediaSurfaceProducer.pushFrame(width, height, rgba8) anyerror!void` — any thread, latest-wins, pixels copied before return | `src/runtime/media_surface.zig:280` |
| `ui.mediaSurface(.{ .image = model.surface_id, ... })` / markup `<media-surface surface="{id}">` | `docs/src/app/components/media-surface/page.mdx` |
| `png.writeRgba8(writer, width, height, rgba8)` / `png.decodeRgba8(bytes, output)` | `src/primitives/canvas/png.zig:62,169` |
| `registerCanvasImage` is capped at 1 MiB of pixels — unusable for the viewport | `src/runtime/canvas_limits.zig:105-106` |

---

## File Structure

| File | Responsibility |
|---|---|
| `app.zon` | Manifest: window, `media-surface` capability, permissions |
| `src/main.zig` | `Model`, `Msg`, `update`, wiring, producer lifecycle |
| `src/app.native` | Markup view: viewport + slider + status |
| `src/pipeline/device.zig` | `MTLDevice`, command queue, texture pool |
| `src/pipeline/kernels.metal` | MSL compute kernels (bayer for the slice) |
| `src/pipeline/execute.zig` | Runs a pass chain over textures, returns RGBA |
| `src/pipeline/diffuse.zig` | Serial error-diffusion kernels (atkinson for the slice) |
| `src/codec.zig` | ImageIO decode → RGBA8 |
| `src/tests.zig` | Zig tests, including golden comparison |
| `fixtures/` | Goldens copied from the `dithrrd` repo |

---

### Task 1: Scaffold and run

**Files:**
- Create: the whole repo via `native init`

**Interfaces:**
- Consumes: nothing
- Produces: a running Zig-core app; `zig build run` opens a window.

**Gate:** a native window opens and responds to a click.

- [ ] **Step 1: Scaffold**

```bash
mkdir -p ~/workspace/dithrrd-native && cd ~/workspace/dithrrd-native
native init . --template zig-core --full
git init && git add -A && git commit -m "chore: scaffold Zig-core Native SDK app"
```

- [ ] **Step 2: Verify the toolchain resolves**

```bash
native doctor --manifest app.zon
```

Expected: no fatal findings. If Zig 0.16.0 is missing it offers to download the pinned toolchain — accept.

- [ ] **Step 3: Run the starter app**

```bash
native dev
```

Expected: a window titled per `app.zon` with a working counter. Click the buttons; the number changes.

If the build fails on `std` API errors, the installed Zig is not 0.16.0 — run `native skills get zig`, which maps pre-0.16 idioms to current ones.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: verify scaffold runs"
```

---

### Task 2: Prove the media-surface producer seam

**This is the make-or-break task. Do it second, before any Metal work.**

**Files:**
- Modify: `app.zon`, `src/main.zig`, `src/app.native`

**Interfaces:**
- Consumes: Task 1's scaffold
- Produces: a `media-surface` in the window displaying app-pushed pixels; a documented way to reach the `Runtime` from app code.

**Gate:** the window shows a solid colour your code pushed — not the SDK's id-derived placeholder. Pushing a different colour changes what is on screen.

**The unknown.** `acquireMediaSurfaceProducer` is defined on `Runtime` (`src/runtime/media_surface.zig:409`) and is loop-thread-only. No example app calls it — the only callers in the SDK are test harnesses reaching through `harness.runtime`. How app code in a `UiApp` reaches the `Runtime` is the thing this task determines. Candidate routes, in order of likelihood:

1. An accessor on the `UiApp` value the app already holds (`app_state` in `main.zig`). Inspect `src/runtime/ui_app.zig` for a public runtime accessor.
2. The `on_frame` hook (`ui_app.zig:653`) plus a container-level pointer to `app_state`, mirroring how `TsUiApp` stashes `boot_images_store` at container level (`src/runtime/ts_ui_app.zig`).
3. `runner.runWithOptions` — check whether the runner exposes the runtime it constructs.

- [ ] **Step 1: Declare the capability**

In `app.zon`, ensure `.capabilities` includes native views and gpu surfaces (the scaffold already sets `.{ "native_views", "gpu_surfaces" }`). No extra capability string is required for media surfaces — they ride the canvas.

- [ ] **Step 2: Add a surface id to the model and bind it in markup**

In `src/main.zig`, add to `Model`:

```zig
    /// Media-surface id for the image viewport. Model-owned, nonzero,
    /// below bit 63 (bit 63 is the toolkit's reserved texture namespace).
    preview_surface: u64 = 1,
```

In `src/app.native`, replace the counter body with a surface bound to it:

```html
<column gap="8" padding="12" grow="1">
  <media-surface surface="{preview_surface}" grow="1" label="Image preview" />
  <text foreground="text_muted">{status}</text>
</column>
```

Add a `status` field to `Model` (`[]const u8` or a fixed buffer, whichever the markup binder accepts — check `native check` output) so there is a visible readout.

- [ ] **Step 3: Verify the placeholder appears**

```bash
native check && native dev
```

Expected: the viewport shows a deterministic placeholder derived from the surface id. **This alone proves the binding works** — the placeholder is documented behaviour until a producer attaches.

- [ ] **Step 4: Acquire a producer and push one solid frame**

Determine the runtime accessor (see candidates above), then acquire the producer once on the loop thread and push a solid-colour frame — 256×256 RGBA8, tightly packed, straight alpha, e.g. all `(255, 0, 128, 255)`.

Acquire once and hold it; do not acquire per frame. `acquireMediaSurfaceProducer` returns `error.MediaSurfaceInUse` for a second live producer on the same id.

- [ ] **Step 5: Verify pixels reach the screen**

```bash
native dev
```

Expected: the viewport is solid magenta, not the placeholder.

Then change the colour, rebuild, and confirm the screen follows. If the placeholder persists, the producer is not attached — re-check the surface id matches the model binding exactly, and that the id is nonzero and below bit 63.

**If no route to the `Runtime` exists after exhausting all three candidates, STOP and report.** Do not work around it by writing pixels some other way — the media-surface path is the architecture. A dead end here means revisiting the design, which is exactly what this slice is for.

- [ ] **Step 6: Document the seam and commit**

Write what you found — the exact accessor, where the producer is acquired, and the thread it runs on — into `docs/seam.md`. Later tasks and the remaining-kernels plan depend on it.

```bash
git add -A && git commit -m "feat: push app-owned frames to a media-surface viewport"
```

---

### Task 3: Metal device and one compute kernel

**Files:**
- Create: `src/pipeline/device.zig`, `src/pipeline/kernels.metal`, `src/pipeline/execute.zig`
- Modify: `build.zig`, `src/main.zig`

**Interfaces:**
- Consumes: Task 2's producer seam
- Produces: `pipeline.renderBayer(src_rgba, width, height, levels, matrix) -> []u8` — RGBA8 out, top-down.

**Gate:** the viewport shows a Bayer-dithered version of a synthetic gradient generated in Zig, and changing `levels` changes what is displayed.

- [ ] **Step 1: Compile MSL at build time**

Add a `build.zig` step that compiles `src/pipeline/kernels.metal` to a `.metallib` and installs it next to the binary (or embeds it). A kernel that does not compile must break `zig build`, not fail at runtime — this converts every shader syntax error into a build error.

Verify: introduce a deliberate syntax error in the `.metal` file, confirm `zig build` fails, then revert.

- [ ] **Step 2: Port the Bayer kernel**

Translate `src/effects/bayer.ts`'s fragment shader from the `dithrrd` repo to an MSL compute kernel. The GLSL is:

```glsl
float threshold(ivec2 p) {
  if (uMatrix > 7.0) { int x = int(mod(float(p.x), 8.0)); int y = int(mod(float(p.y), 8.0));
    return BAYER8[y * 8 + x] / 64.0 - 0.5; }
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
  fragColor = vec4(c, texture(src, vUv).a);
}
```

Both Bayer matrices are in that file verbatim; copy them. In a compute kernel, `pix` is the thread position — no `vUv`/`resolution` indirection needed. Alpha passes through untouched.

- [ ] **Step 3: Build the device and texture pool**

`src/pipeline/device.zig`: create an `MTLDevice` and command queue once, held for the app's life. Provide ping-pong `MTLTexture`s sized to the working image, matching `src/engine/backend.ts`'s two-FBO pool. Format: RGBA8Unorm.

- [ ] **Step 4: Render a synthetic image and display it**

Generate a gradient in Zig, upload it, run the Bayer kernel, read the result back to RGBA8, and `pushFrame` it.

- [ ] **Step 5: Verify**

```bash
native dev
```

Expected: a visibly dithered gradient — regular crosshatch texture, not smooth. Compare by eye against `fixtures/bayer-default.png` in the `dithrrd` repo; the pattern character should match even though the source image differs.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Metal compute pipeline with the Bayer kernel"
```

---

### Task 4: Load a real image through ImageIO

**Files:**
- Create: `src/codec.zig`
- Modify: `src/main.zig`, `src/app.native`

**Interfaces:**
- Consumes: Task 3's pipeline
- Produces: `codec.decodeToRgba8(path) -> { data: []u8, width: usize, height: usize }`, top-down, straight alpha.

**Gate:** opening a JPEG from disk displays it dithered in the viewport.

- [ ] **Step 1: Decode via ImageIO**

Objective-C interop to `CGImageSourceCreateWithURL` → `CGImageSourceCreateImageAtIndex` → draw into a `CGBitmapContext` with `kCGImageAlphaPremultipliedLast`, then un-premultiply to straight alpha. Straight alpha matters: `pushFrame` requires it, and `png.writeRgba8` assumes it.

`png.decodeRgba8` (`src/primitives/canvas/png.zig:169`) covers PNG only, which is why ImageIO is used — it handles JPEG, HEIC, WebP, TIFF, matching the web app's `accept="image/*"`.

- [ ] **Step 2: Downscale to the preview budget**

Fit the decoded image so `width * height * 4 <= 8 MiB` (roughly 2 MP). The web app already caps at `MAX_WORKING_EDGE = 4096` (`src/features/image.ts:2`); the preview cap is tighter and separate. Exceeding it makes `pushFrame` return `error.FrameTooLarge`.

- [ ] **Step 3: Wire a file open**

Simplest for the slice: a hardcoded path in `initialModel`, or a path from `argv`. A native open dialog is a later task — do not build it here.

- [ ] **Step 4: Verify**

Point it at a JPEG and a PNG. Both must display, dithered, right-way-up. **If the image appears upside down, fix it in the codec, not the pipeline** — orientation is a decode concern, and the goldens define top-down output.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: decode images via ImageIO"
```

---

### Task 5: One CPU diffusion kernel and the readback hop

**Files:**
- Create: `src/pipeline/diffuse.zig`
- Modify: `src/pipeline/execute.zig`

**Interfaces:**
- Consumes: Tasks 3 and 4
- Produces: `diffuse.atkinson(buf, width, height, levels, serpentine)` mutating RGBA8 in place; `execute` handling a GPU→CPU→GPU chain.

**Gate:** a `bayer → atkinson` chain displays, with the diffusion texture visibly present.

- [ ] **Step 1: Port the Atkinson kernel**

Translate `src/worker/algorithms.ts` from the `dithrrd` repo. The structure is one `diffuse()` driver plus a kernel table; port the driver and the Atkinson table only. Key details from the reference implementation:

- Accumulate error in `f32` per channel, not `u8` — clamping mid-accumulation changes the result.
- Alpha is left untouched.
- `quantize(value, levels)`: `step = 255 / (levels - 1)`, then `round(round(value / step) * step)`.
- Serpentine alternates direction per row.

**Scan order is load-bearing.** The `dithrrd` goldens were generated with rows in GL bottom-up order through the CPU hop. If you want to compare against `fixtures/atkinson-default.png` in Task 7, either run the diffusion bottom-up or flip before and after. Decide deliberately and write the decision in a comment — this is the single most likely source of a confusing mismatch.

- [ ] **Step 2: Wire the readback hop**

In `execute.zig`, when a step is a CPU effect: read the current texture back to RGBA8, run the kernel, re-upload to a texture, continue. This mirrors `src/engine/execute.ts:19-24` in the web app.

- [ ] **Step 3: Verify**

Run `bayer → atkinson` and confirm the output shows both — ordered pattern plus diffusion noise. Compare against `fixtures/stack-gpu-cpu-gpu.png` in the `dithrrd` repo for the character of a sandwiched chain.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: Atkinson diffusion kernel and the GPU-CPU-GPU hop"
```

---

### Task 6: Interactive slider

**Files:**
- Modify: `src/app.native`, `src/main.zig`

**Interfaces:**
- Consumes: Task 5's chain
- Produces: a slider that re-renders the preview live.

**Gate:** dragging the slider changes the image smoothly, with no stutter or backlog.

- [ ] **Step 1: Add the control**

In `src/app.native`, add a slider bound to a `levels` field on `Model`, dispatching a `set_levels` message.

- [ ] **Step 2: Re-render on change**

In `update`, on `set_levels`: store the value and trigger a re-render.

Start **synchronous** — render inline in `update` and push the frame. At preview resolution this may well be fast enough, and it is far simpler. Measure before adding threads.

- [ ] **Step 3: Measure**

Time a full chain render at preview resolution. Record the number in `docs/seam.md`.

If it is comfortably under ~16 ms, stop here — synchronous is correct and simpler. If not, move rendering to a worker thread: `pushFrame` is explicitly callable from any thread and is latest-wins, so a fast producer cannot build a backlog. Note that `acquireMediaSurfaceProducer` remains loop-thread-only — acquire on the loop thread, push from the worker.

- [ ] **Step 4: Verify**

Drag the slider continuously. The image must track without stutter and must settle on the final value — never on a stale intermediate.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: live slider-driven re-render"
```

---

### Task 7: Verify against the goldens

**Files:**
- Create: `fixtures/` (copied), `src/tests.zig` additions

**Interfaces:**
- Consumes: everything
- Produces: a Zig test asserting the Metal Bayer kernel reproduces the web app's golden.

**Gate:** the Bayer kernel matches `fixtures/bayer-default.png` within tolerance.

This task closes the loop with the harness built in the `dithrrd` repo and is the real payoff of the slice: it converts "looks right" into "provably matches".

- [ ] **Step 1: Copy the goldens and the source image generator**

Copy `fixtures/*.png` and `fixtures/README.md` from the `dithrrd` repo. Reimplement `src/testing/testImage.ts`'s `makeTestImage` in Zig — it is deliberately plain arithmetic with no randomness, so a faithful port produces byte-identical input. Assert that first, standalone: generate 256×256 in Zig, compare against a PNG dump of the TS version. **If the source images differ, every downstream comparison is meaningless** — fix this before proceeding.

- [ ] **Step 2: Port the comparison rule**

From `src/testing/goldens.ts`: a pixel is bad when any channel differs by more than `2`; the golden fails when the bad-pixel fraction exceeds `0.001`. Use `png.decodeRgba8` to read the golden.

Note the known limitation recorded in the `dithrrd` follow-ups: at `0.001` on 256×256 this tolerates ~65 arbitrarily-wrong pixels. Consider adding the companion `maxDelta <= 64` ceiling here from the start.

- [ ] **Step 3: Assert Bayer matches**

Render the Zig test image through the Metal Bayer kernel with `{ matrix: '4', levels: 2 }` — matching `bayer`'s `defaultParams` — and compare against `fixtures/bayer-default.png`.

- [ ] **Step 4: Run**

```bash
native test -Dplatform=null
```

If it fails, report the bad-pixel fraction and max delta before changing anything. A near-miss (a few hundred pixels) suggests a rounding or precision difference; a gross mismatch suggests a coordinate or matrix indexing error. **Do not loosen the tolerance to get green.**

- [ ] **Step 5: Attempt Atkinson, and treat a mismatch as information**

Do the same for `fixtures/atkinson-default.png`. This one tests the scan-order decision from Task 5. A mismatch here is expected if you chose top-down; flipping should resolve it. Record which orientation matched.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "test: verify Metal kernels against web goldens"
```

---

## Done when

- The app opens a real photo, renders `bayer → atkinson` through Metal, and displays it in a `media-surface`.
- A slider re-renders it live without stutter.
- The Metal Bayer kernel provably matches the web app's golden within tolerance.
- `docs/seam.md` records: the runtime accessor, the producer's thread, measured render time, and the diffusion scan orientation that matched.

At that point every load-bearing unknown is retired and the remaining 14 kernels are mechanical work against 18 existing goldens.

## What this slice deliberately does not build

Palette editor, preset persistence, native save dialog, drag-and-drop, menus, the other 14 kernels, the effect catalog, and full-resolution export. All belong to later plans and none of them test an unknown.

## Stop conditions

Stop and report rather than working around, if:

- **Task 2** finds no route from app code to the `Runtime`. The media-surface path is the architecture.
- Metal-from-Zig interop proves impractical enough that a Swift or Objective-C shim is needed — that is a real design change, not an implementation detail.
- **Task 7** shows a gross Bayer mismatch that is not a coordinate bug. It would mean GLSL and MSL disagree more than the tolerance permits, which changes what the goldens are worth as an oracle.
