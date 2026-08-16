# Native File I/O Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it a real Mac app — open an image through a native dialog or by dropping it on the window, export the dithered result at full resolution through a native save dialog, and drive all of it from a real menu bar with keyboard shortcuts.

**Architecture:** Two of the three platform capabilities this needs are **not reachable through `UiApp`** and require seams like the `start_fn` one the vertical slice established. Each gets a spike task that proves the seam before anything is built on it. Export renders at full resolution through a second, separately-sized texture pool, keeping the ≤2 MP preview path untouched.

**Tech Stack:** Zig 0.16, Vercel Native SDK v0.6.1, Metal, ImageIO, AppKit dialogs, macOS.

This is **plan 3 of 3** for the v1 scope in `docs/superpowers/specs/2026-07-27-native-port-design.md`. Plan 1 is merged; plan 2 is `2026-07-28-native-palettes.md`.

## Repo

All work happens in **`/Users/aaron/workspace/dithrrd-native`**. Baseline at time of writing: `main` @ `d1f5a02`, 128 tests green in Debug and ReleaseFast, 27 golden comparisons byte-identical, `native check --strict` clean, CI green. **If plan 2 landed first, rebase these task numbers onto its head and re-baseline the test count.**

## Global Constraints

- **Zig 0.16.0**, SDK pinned at its current path dependency. No new dependencies.
- **`native test` must stay green** in **both** Debug and ReleaseFast. Report both counts.
- **The 27 golden comparisons are load-bearing.** Never touch `fixtures/`, never adjust a tolerance.
- **`Model` is mutated only from `update`, on the loop thread.** The render worker never touches it. Task 3 adds a second thread-crossing and must obey this.
- **Do not modify the seqlock's atomics or `fenceSeqlock`.** Its ordering was wrong once, was fixed under review with measured evidence, and is guarded by a source-text test. Read its doc comment before editing anything nearby.
- **`native check --strict` must pass** on every `app.native` edit.
- **`.github/workflows/ci.yml` asserts real widget names and is in no task's file list.** It has drifted twice. If a task changes the widget tree, update its `automate assert` patterns in the same commit and confirm against a live snapshot.
- Comment density matches the existing files: `//!` module docs, `///` on public declarations, explaining *why*.

## Findings that shape this plan

All verified by reading SDK source at v0.6.1, not the docs.

**1. Native dialogs exist and look reachable, but not by the documented route.**
`platform/macos/root.zig:721-723` wires real `NSOpenPanel`/`NSSavePanel`/`NSAlert` into `PlatformServices.show_open_dialog_fn` / `show_save_dialog_fn` / `show_message_dialog_fn`, and `platform/types.zig:2855-2870` exposes public wrappers `showOpenDialog` / `showSaveDialog` / `showMessageDialog`. The *documented* route is `native-sdk.dialog.openFile` over the **JS bridge** (`runtime/builtin_bridge.zig:177-183`), which needs a webview this app does not have.

`Effects` carries `services: ?*const platform.PlatformServices` (`runtime/effects.zig:4087`), and `update` receives `*Effects`. So `fx.services.?.showOpenDialog(...)` **should** work from `update`, on the loop thread, where the field is documented as valid. **That is an inference, not a verified fact** — hence Task 1.

**2. File drops are NOT routed to `update`. This is the plan's biggest surprise.**
`platform/types.zig` defines `FileDropEvent` and macOS advertises the `.file_drops` capability (`platform/macos/root.zig:806`), and `runtime/api.zig:331` defines a `.files_dropped` event arm. But `UiApp.handleRuntimeEvent`'s switch has **no arm for `.files_dropped` or `.canvas_widget_file_drop`**, and it ends in `else => {}`. Both events are silently swallowed.

Reaching them needs a seam. `UiApp.app()` returns a plain `App` value with `event_fn = eventFn` — the same public-field structure the vertical slice exploited for `start_fn`. Capturing that pointer and installing a wrapper that intercepts drops and delegates everything else is the route to try. Task 3 proves it or reports it impossible.

**3. Menus are declarative and clean.**
`tooling/manifest.zig:48-49` reads `.menus` and `.shortcuts` from `app.zon`, and `UiApp.Options.on_command: ?*const fn (name: []const u8) ?MsgT` (`runtime/ui_app.zig:500`) maps a command name to a `Msg`. `native automate menu-command <id>` and `shortcut <id>` drive them headlessly. No seam needed.

**4. Export needs its own decode and its own pool.**
`codec.decodeToRgba8` downscales to `codec.max_frame_pixels` (~2 MP) **at decode time** — that budget exists because `MediaSurfaceProducer.pushFrame` caps at 8 MiB. Export must decode again without that cap, and `TexturePool.init(gpu, width, height)` is sized once at startup to the preview dimensions, so export needs a second pool at full size. The web app caps its working size at `MAX_WORKING_EDGE = 4096` (`features/image.ts:2`); match that so a 100 MP input cannot exhaust VRAM.

---

### Task 1: Spike — reach a native dialog from a Zig core

**Files:**
- Modify: `src/main.zig`
- Create: `docs/dialogs.md`

**Interfaces:**
- Produces: `dialogs.openImage(fx) ?[]const u8` and `dialogs.saveImage(fx, default_name) ?[]const u8` — or, if the seam does not work, a written verdict and the alternative.

**This task exists to answer one question and must not be skipped or merged into Task 2.** The `acquireMediaSurfaceProducer` precedent is exactly why: the function existed, was public, and still took a dedicated spike to reach, because no example called it and the route was not the obvious one.

- [ ] **Step 1: Try the inferred route**

Add a temporary Msg arm and a toolbar button that calls:

```zig
var path_buf: [platform.max_dialog_path_bytes]u8 = undefined;
const services = fx.services orelse { /* report and bail */ };
const result = services.showOpenDialog(.{
    .title = "Open Image",
    .filters = &.{ .{ .name = "Images", .extensions = "png;jpg;jpeg;heic;tif;tiff;webp" } },
}, &path_buf) catch |err| { /* report err */ };
```

Read `platform/types.zig` for `FileFilter`'s real field names and separator convention — the shape above is a guess and must be corrected against the struct. `OpenDialogResult` is `{ count: usize, paths: []const u8 }`, so multiple paths are packed into one buffer; determine the delimiter from the macOS implementation (`platform/macos/root.zig`'s `showOpenDialog`) rather than assuming.

Build, run, click the button, and record what happens: a real panel, an error, a crash, or nothing.

- [ ] **Step 2: If it fails, try the fallbacks in order**

1. **`Runtime`-side access.** `attachPreviewProducer` holds a `*Runtime`. Check whether `Runtime` exposes services or a dialog method, and if so, stash what is needed at startup the way `g_io`/`g_env` already are.
2. **Direct AppKit.** `NSOpenPanel` via `objc_msgSend` — this app already reaches Metal and ImageIO that way, and `src/pipeline/device.zig` is the working reference for the interop pattern. This is heavier but has no unknowns.

Stop at the first that works.

- [ ] **Step 3: Record the answer**

Write `docs/dialogs.md`: which route works, the exact call shape, what `OpenDialogResult`'s packed `paths` buffer looks like in practice (with a real observed value for both single and multiple selection), whether the call blocks the loop thread and for how long, and what a cancellation returns. **If a route failed, record that too** — the next person must not retry it.

Be honest about a modal dialog blocking the loop thread. It does, and that is acceptable for an explicit user action; note whether the preview keeps rendering underneath (the worker thread is independent, so it may) and whether the window redraws.

- [ ] **Step 4: Extract and commit**

Move the working call into `src/dialogs.zig` behind `openImage`/`saveImage`, remove the temporary button and Msg arm, and confirm `native test` and `native check --strict` are green.

```bash
git add src/dialogs.zig src/main.zig docs/dialogs.md
git commit -m "spike: reach native open/save dialogs from a Zig core"
```

---

### Task 2: Open an image

**Files:**
- Modify: `src/main.zig`, `src/app.native`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `dialogs.openImage`, `codec.decodeToRgba8`.
- Produces: Msg arms `open_image`, `image_opened`; `loadImage(model, path) !void`.

The hard part is not the dialog — it is that **a new image can have different dimensions**, and `g_pool` is sized once at startup.

- [ ] **Step 1: Write the failing test**

`update`'s arm is testable without a GPU if the decode/pool work is behind a function pointer or a checked guard. At minimum, test the state transitions:

```zig
test "update: a failed open leaves the current image and reports it" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    const before = model.status;
    update(&model, .{ .image_opened = .{ .err = error.DecodeFailed } }, &fx);
    try std.testing.expect(!std.mem.eql(u8, before, model.status));
    // store-on-success: the stack and selection are untouched by a failure
    try std.testing.expectEqual(@as(usize, 1), model.stack.len);
}

test "update: a cancelled dialog is not an error and sets no status" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    const before = model.status;
    update(&model, .{ .image_opened = .cancelled }, &fx);
    try std.testing.expectEqualStrings(before, model.status);
}
```

The cancellation case is called out in the design spec's error table as explicitly **not an error**: no status, no message.

- [ ] **Step 2: Implement the reload path**

`loadImage(path)` must, in order: decode to a new `codec.DecodedImage`; **tear down and rebuild `g_pool` at the new dimensions**; free the previous `g_decoded`; install the new one; and request a render.

Three hazards, all real:

- **The worker thread may be mid-render against the old pool and the old decoded image.** Both are process-lifetime globals it reads without synchronization today, which was safe only because they never changed. They now change. Establish a discipline and document it: the simplest correct one is a generation counter the worker checks, or a swap performed only while the worker is known idle. Do not hand-wave this — a torn read here is a use-after-free, not a wrong pixel.
- **`TexturePool` has no `deinit` contract you should assume.** Read `device.zig` and confirm whether textures are released; if not, reloading images leaks VRAM per load. Fix it if so, in this task.
- **A failed decode must leave the previous image on screen**, per the spec's store-on-success rule. Do not free the old image until the new one is known good.

- [ ] **Step 3: Wire the toolbar button and update CI**

Add an "Open…" button to the toolbar. Then update `.github/workflows/ci.yml`'s `automate assert` patterns if the widget tree changed, confirming against a live snapshot — see the Global Constraints note.

- [ ] **Step 4: Verify**

`native test` both modes, `native check --strict`, and manually: open a PNG, a JPEG, and a HEIC; open an image with very different dimensions from the startup one and confirm the preview and the stack still work; cancel the dialog and confirm nothing changes; point it at a non-image file and confirm the previous image survives with a status line.

```bash
git add src/main.zig src/app.native .github/workflows/ci.yml
git commit -m "feat: open an image through a native dialog"
```

---

### Task 3: Spike — intercept file drops

**Files:**
- Modify: `src/main.zig`
- Create: `docs/drops.md`

**This is the second seam task, and the finding behind it is load-bearing: `UiApp` does not route file drops at all.** `handleRuntimeEvent`'s switch has no arm for `.files_dropped` or `.canvas_widget_file_drop`, and its trailing `else => {}` swallows both. Nothing you write in `update` will ever see a drop until this is solved.

- [ ] **Step 1: Confirm the gap before working around it**

Add a temporary `std.debug.print` to a `.files_dropped` arm in `update` (there is none — add one), build, drag a file onto the window, and confirm **nothing prints**. Establishing the negative first means the workaround is verified against a known-failing baseline rather than assumed.

Also confirm the capability is actually advertised at runtime: `platform/macos/root.zig:806` lists `.file_drops`, but check whether anything must opt in — `app.zon`'s `capabilities` currently lists `native_views` and `gpu_surfaces` only.

- [ ] **Step 2: Install an `event_fn` wrapper**

`UiApp.app()` returns a plain `App` value whose `event_fn` field is public — the same structure `main` already exploits for `start_fn`:

```zig
var app_value = app_state.app();
app_value.start_fn = attachPreviewProducer;
```

Capture the original into a file-scope global and install a wrapper that inspects the event, handles `.files_dropped` itself, and delegates everything else unchanged:

```zig
var g_inner_event_fn: ?native_sdk.App.EventFn = null;

fn eventWithDrops(context: *anyopaque, runtime: *native_sdk.Runtime, event: native_sdk.Event) anyerror!void {
    switch (event) {
        .files_dropped => |drop| { /* handle, then still delegate or not — decide and document */ },
        else => {},
    }
    if (g_inner_event_fn) |inner| try inner(context, runtime, event);
}
```

Read `runtime/api.zig` for `EventFn`'s real signature and the `Event` union's real shape before writing this — the sketch above is a shape, not a contract.

**Decide and document whether the wrapper delegates the drop event onward.** `UiApp` ignores it today, so delegating is harmless now and stays correct if a future SDK version starts handling it; swallowing it silently diverges. Prefer delegating.

- [ ] **Step 3: Get the drop into `update`, not into the model directly**

The wrapper runs on the loop thread, so mutating `app_state.model` from it would be *safe* but would bypass `update` — losing the tested seam and the `changesRender` re-render trigger. Find the route that dispatches a real `Msg`: check whether `UiApp` exposes a dispatch method, and if not, whether synthesizing a `.command` event through the inner `event_fn` reaches `on_command`.

If no route exists, mutating the model from the wrapper is acceptable **only** if you also call the same render-request path `update` would have, and document the divergence prominently.

- [ ] **Step 4: Record the answer**

Write `docs/drops.md`: that `UiApp` does not route drops (with the file and line), the wrapper route and whether it worked, the real `FileDropEvent` contents observed for a single file and for several, whether the drop point maps to a widget, and what happens when a non-image is dropped.

- [ ] **Step 5: Commit**

```bash
git add src/main.zig docs/drops.md
git commit -m "spike: intercept file drops through an event_fn wrapper"
```

---

### Task 4: Drag and drop an image

**Files:**
- Modify: `src/main.zig`

Wire Task 3's seam to Task 2's `loadImage`. Small, because both halves exist.

- [ ] **Step 1: Handle the drop**

Take the **first** path whose extension ImageIO can plausibly decode; ignore the rest and say so in the status when more than one was dropped. Route it through exactly the same `loadImage` path the dialog uses — never a parallel copy, or the two will drift.

- [ ] **Step 2: Test the selection logic**

The path-choosing logic is pure and must be tested without a window:

```zig
test "pickDroppedImage takes the first decodable path and ignores the rest" {
    try std.testing.expectEqualStrings("/a/b.png", pickDroppedImage(&.{ "/a/b.png", "/a/c.png" }).?);
    try std.testing.expectEqualStrings("/a/c.jpg", pickDroppedImage(&.{ "/a/notes.txt", "/a/c.jpg" }).?);
    try std.testing.expectEqual(@as(?[]const u8, null), pickDroppedImage(&.{ "/a/notes.txt" }));
    try std.testing.expectEqual(@as(?[]const u8, null), pickDroppedImage(&.{}));
    // extension matching is case-insensitive — Finder hands back what
    // the file actually has, and .JPG is common from cameras
    try std.testing.expectEqualStrings("/a/IMG.JPG", pickDroppedImage(&.{"/a/IMG.JPG"}).?);
}
```

- [ ] **Step 3: Verify and commit**

Manually drop a PNG, a JPEG, a folder, a text file, and a multi-file selection. Confirm each behaves as documented and that a non-image leaves the current image untouched.

```bash
git add src/main.zig
git commit -m "feat: open an image by dropping it on the window"
```

---

### Task 5: Full-resolution PNG export

**Files:**
- Create: `src/pipeline/export.zig`
- Modify: `src/main.zig`, `src/codec.zig`, `src/app.native`

**Interfaces:**
- Consumes: `dialogs.saveImage`, `plan.planPasses`, `execute.renderChain`, `canvas.png.writeRgba8`.
- Produces: `export_mod.renderFullRes(allocator, gpu, path, stack, palettes) !ExportResult`; Msg arms `export_png`, `export_finished`.

This is the task where the preview/export split the design spec describes finally pays off.

- [ ] **Step 1: Add a full-resolution decode path**

`codec.decodeToRgba8` downscales to `max_frame_pixels` (~2 MP) because the media surface caps at 8 MiB. Export must not. Add `codec.decodeToRgba8Full(allocator, path, max_edge)` sharing the same ImageIO/EXIF/premultiply code, capped at **4096** on the long edge to match the web app's `MAX_WORKING_EDGE`.

Do not duplicate the decode body — factor the existing one so both entry points share it. A second copy of the premultiply and EXIF handling would be a correctness hazard, and those paths are subtle.

Test that the two agree: decoding the same fixture through both paths at a size below both caps must produce byte-identical output.

- [ ] **Step 2: Write the failing test**

```zig
test "a full-res export reproduces the preview pipeline at a larger size" {
    // Same stack, same palettes, two sizes: the export path must not
    // introduce a step the preview does not have, or vice versa.
    // Compare structurally (step count and kinds), not pixel-wise —
    // the images are different sizes by construction.
    var s: stack_mod.Stack = .{};
    _ = s.add(.grade).?;
    _ = s.add(.bayer).?;
    _ = s.add(.atkinson).?;
    var store = palette_store.Store.initBuiltins();

    var preview_buf: [stack_mod.max_nodes]execute.Step = undefined;
    var export_buf: [stack_mod.max_nodes]execute.Step = undefined;
    const preview_steps = plan.planPasses(&s, &store, &preview_buf);
    const export_steps = plan.planPasses(&s, &store, &export_buf);
    try std.testing.expectEqual(preview_steps.len, export_steps.len);
    for (preview_steps, export_steps) |a, b| {
        try std.testing.expectEqual(@as(execute.EffectKind, a), @as(execute.EffectKind, b));
    }
}

test "an empty stack exports the source image rather than failing" {
    // Mirrors the preview's empty-stack behaviour, which renderChain
    // already gives for free with zero steps.
}
```

- [ ] **Step 3: Implement**

`renderFullRes` builds a **second** `TexturePool` at the export dimensions, runs `renderChain` over it, reads back, and encodes with `canvas.png.writeRgba8`. Free the export pool when done — a 4096×4096 RGBA pair is 128 MiB of VRAM and must not persist.

**Resolution-dependent effects are the honest caveat here.** `pixelSize`, `cellSize`, and `angle` are in *pixels*, so a stack tuned on a 1600px preview renders a visually different result at 4096px — the same behaviour the web app has, since it exports at working size. Do not silently rescale parameters. Note the behaviour in the status line or a doc, and record the decision.

- [ ] **Step 4: Run it off the loop thread**

A full-res chain at 4096px will take **seconds**, not milliseconds — the preview measured p50 106ms for a 4-effect chain at 2 MP, and 4096² is 8× that. Blocking the loop thread would freeze the window.

Reuse the established discipline rather than inventing a second one: snapshot the `RenderRequest`, hand it to a worker, and report completion by a Msg. Set a status line before starting. **Do not touch the preview seqlock** — export is a one-shot, so a separate simple handoff is correct and safer than generalizing the latest-wins channel.

- [ ] **Step 5: Verify**

Export a 3-effect stack; open the PNG and confirm it is full resolution, correctly oriented, and visually matches the preview. Export with an empty stack and confirm it is the source image. Cancel the save dialog and confirm no file is written and no error appears. Export while a slider drag is in flight and confirm neither render corrupts the other.

```bash
git add src/pipeline/export.zig src/main.zig src/codec.zig src/app.native
git commit -m "feat: full-resolution PNG export"
```

---

### Task 6: Menu bar and keyboard shortcuts

**Files:**
- Modify: `app.zon`, `src/main.zig`

**Interfaces:**
- Produces: `app.zon` `.menus` and `.shortcuts` entries; `onCommand(name) ?Msg` wired to `UiApp.Options.on_command`.

No seam needed — this is the one capability the SDK supports declaratively.

- [ ] **Step 1: Declare the menus**

Read `tooling/manifest.zig`'s `MenuMetadata` and `ShortcutMetadata` for the exact schema before writing `app.zon`; the shapes are not documented in the skill file. Declare:

| Menu | Item | Shortcut | Command |
|---|---|---|---|
| File | Open Image… | ⌘O | `file.open` |
| File | Export PNG… | ⌘E | `file.export` |
| Edit | Reset Stack | ⌘⌫ | `edit.reset` |
| Edit | Add Effect | ⌘N | `edit.add` |

Note the SDK requires shortcuts to carry a modifier (`ui_app.zig:560`) — a bare key is rejected.

- [ ] **Step 2: Write the failing test**

`onCommand` is a pure function and must be tested directly:

```zig
test "onCommand maps every declared command to a Msg, and unknown names to null" {
    try std.testing.expect(onCommand("file.open") != null);
    try std.testing.expect(onCommand("file.export") != null);
    try std.testing.expect(onCommand("edit.reset") != null);
    try std.testing.expect(onCommand("edit.add") != null);
    try std.testing.expectEqual(@as(?Msg, null), onCommand("nope"));
    try std.testing.expectEqual(@as(?Msg, null), onCommand(""));
}
```

Add a test that every command string in `app.zon` has a mapping. `app.zon` is data the Zig side cannot read at comptime, so this means keeping one list in Zig and asserting `onCommand` answers for each — and a comment saying the two must be edited together, since nothing else enforces it. That is the same class of drift as `ci.yml`, which has already bitten twice.

- [ ] **Step 3: Wire and verify**

Set `.on_command = onCommand` in the `UiApp` options. Verify headlessly with `native automate menu-command <id>` and `native automate shortcut <id>`, then by hand with the real keyboard. Confirm ⌘O opens the dialog and ⌘E the save dialog.

```bash
git add app.zon src/main.zig
git commit -m "feat: menu bar and keyboard shortcuts"
```

---

### Task 7: Error surfaces

**Files:**
- Modify: `src/main.zig`

The design spec's error table is the specification for this task. Implement it exactly:

| Failure | Handling |
|---|---|
| `decode_failed` / unsupported format | status line, keep current image |
| `FrameTooLarge` (preview above 8 MiB) | should be unreachable given fit-to-viewport — **assert**, do not recover |
| `MediaSurfaceInUse` | startup bug — fail loudly |
| `MediaSurfaceReleased` | expected during shutdown — ignore |
| `write_failed` on export | **message dialog**, keep the image |
| Save dialog cancelled | not an error: no status, no message |

- [ ] **Step 1: Test every row**

One `update` test per row, asserting the specific behaviour — that a cancel sets no status is as much a requirement as that a write failure shows a dialog, and it is the one most likely to be got wrong by treating cancellation as an error path.

- [ ] **Step 2: Use a real dialog for export failures**

`showMessageDialog` came from Task 1. An export failure is the one case the spec calls for a dialog rather than a status line, because the user asked for a file and did not get one.

- [ ] **Step 3: Verify and commit**

Force each failure: a corrupt image file, a read-only export directory, a cancelled save. Confirm the app never blanks the viewport and never exits.

```bash
git add src/main.zig
git commit -m "feat: error surfaces per the design spec's error table"
```

---

## Out of scope

- Multi-image / batch export.
- Export formats other than PNG.
- Zoom and pan; the preview contract stays fit-to-viewport, per the spec.
- Recent-files menu, window restoration, document-based app behaviour.
- Presets and `?p=` share URLs — explicitly dropped by the spec.

## Known risks

- **Two of the three capabilities need seams, and one is confirmed unrouted.** Tasks 1 and 3 are spikes for exactly this reason. If Task 3's `event_fn` wrapper does not work, drag-and-drop may need to be cut from v1 — it is the least essential item here, since the dialog and the menu both cover opening a file. Escalate rather than forcing it.
- **Reloading an image mutates globals the render worker reads.** `g_pool` and `g_decoded` have been immutable-after-startup until now, and the worker reads them without synchronization. Task 2 must establish a discipline; this is the most likely place for a real crash in this plan.
- **Full-res export is seconds-long and VRAM-hungry.** 4096² RGBA ping-pong is 128 MiB. Free the export pool.
- **Resolution-dependent effects look different at export size.** Inherent to the design and shared with the web app, but it will read as a bug if undocumented.
- **`ci.yml` drifts silently.** It is in no task's file list and has broken twice. Any task touching the widget tree updates it in the same commit.
