# Native Palettes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three hardcoded built-in palettes with a real palette store the user can add to, edit, and keep across restarts.

**Architecture:** A fixed-capacity POD `palette.Store` holds built-in and custom palettes side by side, addressed by **stable ids** rather than positional indices. The store becomes the single source for the three places that currently express the palette table separately. Custom palettes serialize to JSON on disk through the SDK's file effects; built-ins are never persisted.

**Tech Stack:** Zig 0.16, Vercel Native SDK v0.6.1, Native markup, macOS.

This is **plan 2 of 3** for the v1 scope in `docs/superpowers/specs/2026-07-27-native-port-design.md`. Plan 1 (`2026-07-27-native-stack-ui.md`) is merged; plan 3 is `2026-07-28-native-file-io.md`.

## Repo

All work happens in **`/Users/aaron/workspace/dithrrd-native`**, currently `main` @ `d1f5a02`: 128 tests green in Debug and ReleaseFast, 27 golden comparisons byte-identical, `native check --strict` clean, CI green.

Reference sources live in the web repo at `/Users/aaron/workspace/dithrrd/src/`. Read them; never modify them.

## Global Constraints

- **Zig 0.16.0**, SDK pinned at its current path dependency. No new dependencies.
- **`native test` must stay green** — currently 128, in **both** Debug and ReleaseFast. Report both.
- **The 27 golden comparisons are load-bearing.** Never touch `fixtures/` and never adjust a tolerance. A red golden means the change is wrong.
- **`Model` is mutated only from `update`, on the loop thread.** The render worker never touches it.
- **`Stack` must stay POD and copyable by plain assignment** — the render worker snapshots it under a seqlock. Anything reachable from a render must obey the same rule; see Task 3, which is where this bites.
- **`native check --strict` must pass** on every `app.native` edit.
- Palette names and colours are copied **verbatim** from `dithrrd/src/color/palettes.ts`. They are user-visible.
- Comment density matches the existing files: `//!` module docs and `///` on public declarations, explaining *why*.

## What already exists

| | where | what it is |
|---|---|---|
| Three built-ins | `src/color/palettes.zig` | `bw`, `gray4`, `gameboy` as three independent `pub const`s |
| Pipeline table | `src/pipeline/plan.zig` `builtin_palettes` | `[3]Palette` array, `pub`, cross-checked by a test |
| UI options | `src/ui_slots.zig` `palette_options` | Three hand-written `catalog.Option`s |
| Param storage | `catalog.ParamValue.palette: u8` | **A positional index.** This is the thing Task 3 must change. |

`plan.zig`'s `paletteAt` already clamps an out-of-range index to `bw`, mirroring the web app's `ctx.palettes[id] ?? PALETTES.bw`.

## The design problem, stated once

`ParamValue.palette` is a `u8` **index**. That is fine while the table is a fixed three, and wrong the moment palettes can be deleted: deleting palette 1 silently repoints every node that referenced palette 2. The web app never had this problem because it keyed by a UUID string.

Task 3 therefore changes `ParamValue.palette` to a **stable `u32` id**, assigned monotonically and never reused — exactly the discipline `stack.Stack.next_id` already follows for nodes, and for the same reason. Do that before building any UI on top.

---

### Task 1: Hex parsing and formatting

**Files:**
- Create: `src/color/hex.zig`
- Reference (read-only, other repo): `dithrrd/src/color/hex.ts`

**Interfaces:**
- Produces: `hex.isValid(s) bool`, `hex.toRgb01(s) ?[3]f32`, `hex.fromRgb01(rgb, out: *[7]u8) []const u8`.

Pure functions, no allocator. This is the smallest task and it is first because both the editor UI and the serializer depend on it.

- [ ] **Step 1: Write the failing test**

Create `src/color/hex.zig` with only these tests:

```zig
const std = @import("std");

test "toRgb01 matches hex.ts for gameboy's shades" {
    // hexToRgb01('0f380f') -> [15/255, 56/255, 15/255]
    const c = toRgb01("0f380f").?;
    try std.testing.expectApproxEqAbs(@as(f32, 15.0 / 255.0), c[0], 1e-7);
    try std.testing.expectApproxEqAbs(@as(f32, 56.0 / 255.0), c[1], 1e-7);
    try std.testing.expectApproxEqAbs(@as(f32, 15.0 / 255.0), c[2], 1e-7);
}

test "toRgb01 accepts a leading # and surrounding whitespace, like hex.ts" {
    try std.testing.expect(toRgb01("#ffffff") != null);
    try std.testing.expect(toRgb01("  #0f380f  ") != null);
    try std.testing.expect(toRgb01("0F380F") != null); // case-insensitive
}

test "toRgb01 rejects everything hex.ts's regex rejects" {
    try std.testing.expectEqual(@as(?[3]f32, null), toRgb01(""));
    try std.testing.expectEqual(@as(?[3]f32, null), toRgb01("fff")); // 3-digit shorthand is NOT accepted
    try std.testing.expectEqual(@as(?[3]f32, null), toRgb01("0f380")); // too short
    try std.testing.expectEqual(@as(?[3]f32, null), toRgb01("0f380ff")); // too long
    try std.testing.expectEqual(@as(?[3]f32, null), toRgb01("gg380f")); // non-hex digit
    try std.testing.expectEqual(@as(?[3]f32, null), toRgb01("#g0380f"));
}

test "isValid agrees with toRgb01 on every case above" {
    const good = [_][]const u8{ "0f380f", "#ffffff", "  #0f380f  ", "0F380F" };
    const bad = [_][]const u8{ "", "fff", "0f380", "0f380ff", "gg380f", "#g0380f" };
    for (good) |s| try std.testing.expect(isValid(s));
    for (bad) |s| try std.testing.expect(!isValid(s));
}

test "fromRgb01 round-trips every byte value exactly" {
    var buf: [7]u8 = undefined;
    var i: u16 = 0;
    while (i < 256) : (i += 1) {
        const v: f32 = @floatCast(@as(f64, @floatFromInt(i)) / 255.0);
        const s = fromRgb01(.{ v, v, v }, &buf);
        const back = toRgb01(s).?;
        try std.testing.expectApproxEqAbs(v, back[0], 1e-6);
    }
}

test "fromRgb01 clamps out-of-range input rather than wrapping" {
    var buf: [7]u8 = undefined;
    try std.testing.expectEqualStrings("#000000", fromRgb01(.{ -1, -0.5, 0 }, &buf));
    try std.testing.expectEqualStrings("#ffffff", fromRgb01(.{ 1, 2, 99 }, &buf));
}

test "fromRgb01 pads single-digit components, like rgb01ToHex's padStart" {
    var buf: [7]u8 = undefined;
    // 1/255 rounds to 1 -> "01", not "1"
    try std.testing.expectEqualStrings("#010101", fromRgb01(.{ 1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0 }, &buf));
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/aaron/workspace/dithrrd-native && native test`
Expected: compile error — `toRgb01`, `isValid`, `fromRgb01` undefined. (`build.zig`'s `writeTestAggregate` globs `src/`, so no import edit is needed anywhere.)

- [ ] **Step 3: Write the implementation**

Prepend to `src/color/hex.zig`:

```zig
//! Port of `dithrrd/src/color/hex.ts`. Used by the palette editor's
//! text entry and by the palette serializer, which stores colours as
//! hex strings so a hand-edited palettes.json stays readable.
//!
//! **The f64-then-narrow step is deliberate and load-bearing.**
//! `hex.ts` divides by 255 at JS number (f64) precision and the result
//! only narrows to f32 when bound to a GLSL `vec3` uniform. Dividing
//! directly in f32 here would produce a different last bit for some
//! inputs, and the palette goldens (`palette-default`,
//! `duotone-default`) are byte-exact. `color/palettes.zig`'s
//! `hexToRgb01` already documents this for the comptime built-ins;
//! this is the runtime equivalent and must round identically — a test
//! below pins the two against each other.

const std = @import("std");

/// `HEX_RE = /^#?[0-9a-fA-F]{6}$/` after `.trim()`. Note what this
/// does NOT accept, matching the web app exactly: no 3-digit
/// shorthand, no 8-digit alpha form.
pub fn isValid(raw: []const u8) bool {
    return parse(raw) != null;
}

fn parse(raw: []const u8) ?[3]u8 {
    const trimmed = std.mem.trim(u8, raw, &std.ascii.whitespace);
    const body = if (trimmed.len > 0 and trimmed[0] == '#') trimmed[1..] else trimmed;
    if (body.len != 6) return null;
    var out: [3]u8 = undefined;
    for (0..3) |i| {
        out[i] = std.fmt.parseInt(u8, body[i * 2 ..][0..2], 16) catch return null;
    }
    return out;
}

pub fn toRgb01(raw: []const u8) ?[3]f32 {
    const bytes = parse(raw) orelse return null;
    var out: [3]f32 = undefined;
    for (0..3) |i| {
        // Divide at f64, narrow after — see the module doc comment.
        out[i] = @floatCast(@as(f64, @floatFromInt(bytes[i])) / 255.0);
    }
    return out;
}

/// Writes `#rrggbb` into `out` and returns the written slice. Takes a
/// caller-owned buffer rather than allocating: every call site either
/// formats into a frame arena or into a fixed field on the model.
pub fn fromRgb01(rgb: [3]f32, out: *[7]u8) []const u8 {
    out[0] = '#';
    for (rgb, 0..) |component, i| {
        // `Math.round(Math.min(1, Math.max(0, v)) * 255)` — clamp
        // first, then round. Clamping after rounding would let 1.6
        // become 255 by a different route and -0.4 become 0 by
        // rounding rather than by clamping; same answer here, but the
        // order is the web app's and is what the test pins.
        const clamped = std.math.clamp(component, 0, 1);
        const byte: u8 = @intFromFloat(@round(clamped * 255.0));
        _ = std.fmt.bufPrint(out[1 + i * 2 ..][0..2], "{x:0>2}", .{byte}) catch unreachable;
    }
    return out[0..7];
}
```

If `{x:0>2}` is not the correct zero-padded lowercase hex format specifier in this Zig 0.16 toolchain, find the one that is and use it — do not hand-roll digit arithmetic.

- [ ] **Step 4: Pin against the comptime built-ins**

Add one more test, which is the reason the f64 discipline is documented:

```zig
test "toRgb01 agrees bit-for-bit with palettes.zig's comptime hexToRgb01" {
    const palettes = @import("palettes.zig");
    // gameboy is `[hex('0f380f'), hex('306230'), hex('8bac0f'), hex('9bbc0f')]`
    const literals = [_][]const u8{ "0f380f", "306230", "8bac0f", "9bbc0f" };
    for (literals, palettes.gameboy.colors) |literal, comptime_color| {
        const runtime_color = toRgb01(literal).?;
        // Bit-exact, not approximate: a different rounding path here
        // would shift a palette golden.
        try std.testing.expectEqual(comptime_color[0], runtime_color[0]);
        try std.testing.expectEqual(comptime_color[1], runtime_color[1]);
        try std.testing.expectEqual(comptime_color[2], runtime_color[2]);
    }
}
```

- [ ] **Step 5: Run and commit**

Run: `native test` (Debug and ReleaseFast). Expected: PASS, +8 tests.

```bash
git add src/color/hex.zig
git commit -m "feat: hex parsing and formatting for palette colours"
```

---

### Task 2: The palette store

**Files:**
- Create: `src/color/palette_store.zig`
- Reference (read-only, other repo): `dithrrd/src/store/store.ts` (the palette actions), `dithrrd/src/color/palettes.ts`

**Interfaces:**
- Consumes: `color/palettes.zig`'s three built-ins, `color/hex.zig`.
- Produces: `palette_store.Palette` (`{ id: u32, builtin: bool, name_buf: [max_name]u8, name_len: u8, colors: [max_colors][3]f32, color_count: u8 }` with `pub fn name() []const u8` and `pub fn slice() []const [3]f32`), `palette_store.Store` with `entries`, `len`, `next_id`, and methods `initBuiltins()`, `byId(u32) ?*const Palette`, `add() ?u32`, `duplicate(u32) ?u32`, `remove(u32) bool`, `rename(u32, []const u8)`, `setColor(u32, usize, [3]f32)`, `addSwatch(u32) bool`, `removeSwatch(u32, usize) bool`, `moveSwatch(u32, usize, i32)`, `items() []const Palette`, `defaultId() u32`. Constants `max_palettes` (= 32), `max_colors` (= 16), `max_name` (= 32).

Pure state, no allocator, no I/O. **`Store` must be POD and copyable by plain assignment** for the same reason `Stack` is — Task 3 hands a snapshot of it to the render worker.

- [ ] **Step 1: Write the failing test**

Create `src/color/palette_store.zig` with only these tests:

```zig
const std = @import("std");
const palettes = @import("palettes.zig");

test "initBuiltins seeds the three built-ins with their web display names" {
    var s = Store.initBuiltins();
    try std.testing.expectEqual(@as(usize, 3), s.len);
    try std.testing.expectEqualStrings("Black & White", s.items()[0].name());
    try std.testing.expectEqualStrings("Grayscale 4", s.items()[1].name());
    try std.testing.expectEqualStrings("Game Boy", s.items()[2].name());
    for (s.items()) |p| try std.testing.expect(p.builtin);
}

test "built-in colours match palettes.zig bit-for-bit" {
    var s = Store.initBuiltins();
    const gameboy = s.items()[2];
    try std.testing.expectEqual(@as(usize, 4), gameboy.slice().len);
    for (palettes.gameboy.colors, gameboy.slice()) |want, got| {
        try std.testing.expectEqual(want[0], got[0]);
        try std.testing.expectEqual(want[1], got[1]);
        try std.testing.expectEqual(want[2], got[2]);
    }
}

test "defaultId is Game Boy — both palette-driven effects default to it" {
    var s = Store.initBuiltins();
    try std.testing.expectEqualStrings("Game Boy", s.byId(s.defaultId()).?.name());
}

test "ids are stable across a removal and never reused" {
    var s = Store.initBuiltins();
    const a = s.add().?;
    const b = s.add().?;
    try std.testing.expect(s.remove(a));
    const c = s.add().?;
    try std.testing.expect(c != a and c != b);
    // b's id still resolves to b after a's removal shifted the array
    try std.testing.expect(s.byId(b) != null);
}

test "a built-in cannot be removed, renamed, or recoloured" {
    var s = Store.initBuiltins();
    const builtin = s.items()[0].id;
    try std.testing.expect(!s.remove(builtin));
    s.rename(builtin, "Nope");
    try std.testing.expectEqualStrings("Black & White", s.byId(builtin).?.name());
    s.setColor(builtin, 0, .{ 1, 0, 0 });
    try std.testing.expectEqual(@as(f32, 0), s.byId(builtin).?.slice()[0][0]);
    try std.testing.expect(!s.addSwatch(builtin));
    try std.testing.expect(!s.removeSwatch(builtin, 0));
}

test "duplicate copies colours, is editable, and takes an unused name" {
    var s = Store.initBuiltins();
    const gameboy = s.defaultId();
    const copy_id = s.duplicate(gameboy).?;
    const copy = s.byId(copy_id).?;
    try std.testing.expect(!copy.builtin);
    try std.testing.expectEqual(@as(usize, 4), copy.slice().len);
    try std.testing.expectEqualStrings("Game Boy copy", copy.name());
    // editable, unlike its source
    s.setColor(copy_id, 0, .{ 1, 0, 0 });
    try std.testing.expectEqual(@as(f32, 1), s.byId(copy_id).?.slice()[0][0]);
    // and the source is untouched
    try std.testing.expectEqual(palettes.gameboy.colors[0][0], s.byId(gameboy).?.slice()[0][0]);
}

test "add names new palettes Custom 1, Custom 2, ... skipping names in use" {
    var s = Store.initBuiltins();
    const first = s.add().?;
    try std.testing.expectEqualStrings("Custom 1", s.byId(first).?.name());
    const second = s.add().?;
    try std.testing.expectEqualStrings("Custom 2", s.byId(second).?.name());
    s.rename(first, "Custom 3");
    const third = s.add().?;
    // "Custom 1" is free again, and nextCustomName takes the lowest free one
    try std.testing.expectEqualStrings("Custom 1", s.byId(third).?.name());
}

test "a new palette starts with one black swatch" {
    var s = Store.initBuiltins();
    const id = s.add().?;
    try std.testing.expectEqual(@as(usize, 1), s.byId(id).?.slice().len);
    try std.testing.expectEqual(@as(f32, 0), s.byId(id).?.slice()[0][0]);
}

test "swatch count is bounded at both ends, matching PaletteEditor.tsx" {
    var s = Store.initBuiltins();
    const id = s.add().?;
    // MAX_SWATCHES = 16; starts at 1, so 15 more succeed and the 16th fails
    for (0..max_colors - 1) |_| try std.testing.expect(s.addSwatch(id));
    try std.testing.expect(!s.addSwatch(id));
    try std.testing.expectEqual(max_colors, s.byId(id).?.slice().len);
    // and the last swatch cannot be removed (`colors.length <= 1` guard)
    for (0..max_colors - 1) |_| try std.testing.expect(s.removeSwatch(id, 0));
    try std.testing.expect(!s.removeSwatch(id, 0));
}

test "moveSwatch swaps with its neighbour and clamps at the ends" {
    var s = Store.initBuiltins();
    const id = s.add().?;
    _ = s.addSwatch(id);
    _ = s.addSwatch(id);
    s.setColor(id, 0, .{ 1, 0, 0 });
    s.setColor(id, 1, .{ 0, 1, 0 });
    s.setColor(id, 2, .{ 0, 0, 1 });
    s.moveSwatch(id, 2, -1); // blue up: red, blue, green
    try std.testing.expectEqual(@as(f32, 1), s.byId(id).?.slice()[1][2]);
    s.moveSwatch(id, 0, -1); // already first: no-op, not a wrap
    try std.testing.expectEqual(@as(f32, 1), s.byId(id).?.slice()[0][0]);
}

test "rename truncates at a UTF-8 boundary rather than splitting a codepoint" {
    var s = Store.initBuiltins();
    const id = s.add().?;
    // 'é' is two bytes; a name of max_name-1 ASCII plus 'é' must not
    // store half of it.
    var long: [max_name + 8]u8 = @splat('a');
    long[max_name - 1] = 0xC3;
    long[max_name] = 0xA9;
    s.rename(id, long[0 .. max_name + 1]);
    try std.testing.expect(std.unicode.utf8ValidateSlice(s.byId(id).?.name()));
}

test "add refuses past max_palettes and reports it" {
    var s = Store.initBuiltins();
    while (s.len < max_palettes) _ = s.add().?;
    try std.testing.expectEqual(@as(?u32, null), s.add());
}

test "a Store copies by value — the copy is independent" {
    var s = Store.initBuiltins();
    const id = s.add().?;
    var snapshot = s;
    s.setColor(id, 0, .{ 1, 1, 1 });
    try std.testing.expectEqual(@as(f32, 0), snapshot.byId(id).?.slice()[0][0]);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `native test`
Expected: compile error — `Store`, `max_colors`, `max_palettes` undefined.

- [ ] **Step 3: Write the implementation**

Prepend to `src/color/palette_store.zig` a module doc comment covering: why ids are stable and never reused (a node's `params[i].palette` outlives a deletion — the same reasoning `stack.Stack.next_id` documents); why `Store` is POD and copyable (the render worker snapshots it, exactly like `Stack`); why built-ins are immutable and never persisted (`PaletteEditor.tsx` shows "Built-in palette. Duplicate it to edit its colors."); and that `max_colors` is 16 because `PaletteEditor.tsx`'s `MAX_SWATCHES` is 16 **and** `device.zig`'s `palette_max` is 16, so the two ceilings already agree and must stay agreeing.

Then the types and methods matching the interface block above. Points the tests pin, so get them right:

- `initBuiltins` assigns ids 1, 2, 3 and sets `next_id = 4`. `defaultId()` returns the Game Boy id — do not hardcode `3`; find it by matching against `palettes.gameboy`, so a reordering of the built-ins cannot silently change the default.
- `nextCustomName` mirrors `store.ts`'s: try `Custom 1`, `Custom 2`, … and take the **first name not currently in use**, not `len + 1`.
- `duplicate` names the copy `"<source> copy"`, truncated to `max_name` at a UTF-8 boundary.
- Every mutator no-ops on an unknown id, and every mutator except `duplicate` no-ops on a built-in. `remove`/`addSwatch`/`removeSwatch` return `bool` so a caller can tell refusal from success; `rename`/`setColor`/`moveSwatch` return void because no caller needs to.
- `removeSwatch` refuses when one swatch remains (`PaletteEditor.tsx`'s `colors.length <= 1` guard).
- `moveSwatch` swaps with the neighbour and clamps at the ends, mirroring `PaletteEditor.tsx`'s `move`.

- [ ] **Step 4: Run and commit**

Run: `native test` (both modes). Expected: PASS, +13 tests.

```bash
git add src/color/palette_store.zig
git commit -m "feat: palette store with stable ids and immutable built-ins"
```

---

### Task 3: Stable palette ids through the pipeline

**Files:**
- Modify: `src/catalog.zig`, `src/pipeline/plan.zig`, `src/ui_slots.zig`, `src/main.zig`, `src/tests.zig`
- Delete: `src/pipeline/plan.zig`'s `builtin_palettes`, `src/ui_slots.zig`'s `palette_options`

**Interfaces:**
- Consumes: `palette_store.Store`.
- Produces: `catalog.ParamValue.palette` widened to `u32` (a stable id); `Model.palettes: palette_store.Store`; `plan.planPasses` taking the store; a `RenderRequest` carrying both `Stack` and `Store`.

**This is the integration task and the riskiest one in the plan.** It removes two of the three duplicated palette tables and changes a value that flows from the UI through the model into the Metal ABI.

- [ ] **Step 1: Write the failing tests**

Add to `src/pipeline/plan.zig`:

```zig
test "a palette param resolves through the store by id, not by position" {
    var store = palette_store.Store.initBuiltins();
    const custom = store.add().?;
    store.setColor(custom, 0, .{ 1, 0, 0 });

    var s: stack_mod.Stack = .{};
    const node = s.add(.duotone).?;
    s.setParam(node, 0, .{ .palette = custom });

    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    const step = planPasses(&s, &store, &buf)[0];
    try std.testing.expectEqual(@as(i32, 1), step.duotone.count);
    try std.testing.expectEqual(@as(f32, 1), step.duotone.colors[0][0]);
}

test "deleting a palette does not silently repoint nodes that referenced another" {
    // The exact bug a positional index would have: delete the palette
    // BEFORE the referenced one and the reference must still resolve to
    // the same colours, not shift by one.
    var store = palette_store.Store.initBuiltins();
    const doomed = store.add().?;
    const kept = store.add().?;
    store.setColor(kept, 0, .{ 0, 1, 0 });

    var s: stack_mod.Stack = .{};
    const node = s.add(.palette).?;
    s.setParam(node, 0, .{ .palette = kept });

    try std.testing.expect(store.remove(doomed));

    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    const step = planPasses(&s, &store, &buf)[0];
    try std.testing.expectEqual(@as(f32, 1), step.palette.colors[0][1]);
}

test "a node referencing a deleted palette falls back to bw, not to garbage" {
    var store = palette_store.Store.initBuiltins();
    const doomed = store.add().?;
    store.setColor(doomed, 0, .{ 1, 0, 1 });

    var s: stack_mod.Stack = .{};
    const node = s.add(.duotone).?;
    s.setParam(node, 0, .{ .palette = doomed });
    try std.testing.expect(store.remove(doomed));

    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    const step = planPasses(&s, &store, &buf)[0];
    // PALETTES.bw: two colours, black then white
    try std.testing.expectEqual(@as(i32, 2), step.palette.count);
    try std.testing.expectEqual(@as(f32, 0), step.palette.colors[0][0]);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `native test`. Expected: compile errors — `planPasses` takes two arguments, `.palette` payload is `u8`.

- [ ] **Step 3: Widen the param and thread the store**

1. `catalog.ParamValue.palette` becomes `u32`. Update its doc comment to say it is a **stable id issued by `palette_store.Store`**, never an index, and why.
2. `catalog`'s two palette controls default to `.{ .palette = 0 }` — a sentinel meaning "the store's default". `catalog` must **not** import `palette_store` (it is the leaf of the dependency graph and stays that way); resolving 0 to the real default happens where the store is in hand. Document the sentinel on the field. Add a test that both palette-typed controls default to the sentinel.
3. `plan.zig`: delete `builtin_palettes` and `paletteAt`. `planPasses` and `stepFor` take a `*const palette_store.Store`; the palette arms resolve `p[0].palette` through `store.byId`, falling back to `palettes.bw` on a miss (keeping the web app's `?? PALETTES.bw` behaviour) and treating the 0 sentinel as `store.defaultId()`.
4. `ui_slots.zig`: delete `palette_options`. `slotsFor` takes a `*const palette_store.Store` and, for a `.palette` control, projects the store's live entries into the slot's options with `index` set positionally and `choice` set to the **position of the referenced id**, so the dropdown highlights the right row. Its `Option.value` carries the palette's id rendered as text; the picker's `on-press` dispatches the position, and `setSlotChoice` maps position → id.
5. `main.zig`: add `palettes: palette_store.Store = palette_store.Store.initBuiltins()` to `Model`. Thread it into every `slotsFor` call and into `doRender`.

**The `Option.value`-as-text detail matters**: `Option` is currently a comptime literal type with `[]const u8` fields. Store entries are runtime data, so the projected options must borrow from a buffer that outlives the frame. Put a fixed `[max_palettes]Option` scratch on `Slot` or project into the frame arena — whichever you choose, say why in a comment, and make sure no slice points into a stack temporary.

- [ ] **Step 4: Extend the render request to carry the store**

The render worker currently snapshots a `Stack`. Palettes now affect pixels, so it must snapshot both. Introduce:

```zig
/// What one render needs, snapshotted together. Both fields are POD
/// and copyable by plain assignment — the seqlock hands this whole
/// struct across the thread boundary, so anything added here must obey
/// the same rule (see stack.zig's and palette_store.zig's module doc
/// comments). Grouping them is not cosmetic: taking two independent
/// snapshots could tear a stack against a palette store from a
/// different edit, so a node could reference an id the paired store
/// has already dropped.
const RenderRequest = struct {
    stack: stack_mod.Stack = .{},
    palettes: palette_store.Store = palette_store.Store.initBuiltins(),
};
```

Change `g_render_slots` to `[2]RenderRequest`, `requestStackRender` to copy both fields, and `doRender` to take a `*const RenderRequest`. **Do not touch the seqlock's atomics or `fenceSeqlock` — the ordering is correct and was fixed under review; only the payload type changes.** Re-read `fenceSeqlock`'s doc comment before editing anything near it.

- [ ] **Step 5: Verify the goldens and the whole suite**

Run: `native test` in Debug and ReleaseFast.
Expected: PASS. All 27 goldens still green — they call the single-effect `render*` wrappers and do not go through `planPasses`, so a red golden here means something deeper broke.

Also run `native check --strict` and confirm clean, and launch the app (`native dev`) to confirm the palette dropdown still lists the three built-ins and that selecting each visibly changes a `duotone` node's output.

- [ ] **Step 6: Commit**

```bash
git add src/catalog.zig src/pipeline/plan.zig src/ui_slots.zig src/main.zig src/tests.zig
git commit -m "feat: stable palette ids, resolved through the store at plan time"
```

---

### Task 4: Palette management UI

**Files:**
- Modify: `src/app.native`, `src/main.zig`

**Interfaces:**
- Produces: Msg arms `open_palette_editor`, `close_palette_editor`, `add_palette`, `duplicate_palette`, `remove_palette`, `select_palette: u32`; `Model.palette_editor_open: bool`, `Model.editing_palette: u32`.

The editor is a **modal `dialog`**, opened from a button beside the palette dropdown in the controls pane. A dialog rather than a fourth pane because it is a mode, not a persistent inspector, and because the controls pane is already `min-width="200"` and cannot host a swatch list.

- [ ] **Step 1: Write the failing test**

Add to `src/main.zig`'s tests:

```zig
test "update: opening the palette editor targets the selected effect's palette" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    const node = model.stack.add(.duotone).?;
    const custom = model.palettes.add().?;
    model.stack.setParam(node, 0, .{ .palette = custom });

    update(&model, .open_palette_editor, &fx);
    try std.testing.expectEqual(true, model.palette_editor_open);
    try std.testing.expectEqual(custom, model.editing_palette);

    update(&model, .close_palette_editor, &fx);
    try std.testing.expectEqual(false, model.palette_editor_open);
}

test "update: add_palette creates one, selects it, and points the edited node at it" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    const node = model.stack.add(.palette).?;
    const before = model.palettes.len;

    update(&model, .add_palette, &fx);
    try std.testing.expectEqual(before + 1, model.palettes.len);
    // the new palette is now both the edit target and the node's param
    const created = model.editing_palette;
    try std.testing.expectEqual(created, model.stack.items()[0].params[0].palette);
    _ = node;
}

test "update: removing the edited palette repoints the editor at the default" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    _ = model.stack.add(.duotone).?;
    update(&model, .add_palette, &fx);
    const created = model.editing_palette;

    update(&model, .remove_palette, &fx);
    try std.testing.expectEqual(@as(?*const palette_store.Palette, null), model.palettes.byId(created));
    try std.testing.expect(model.editing_palette != created);
    try std.testing.expect(model.palettes.byId(model.editing_palette) != null);
}

test "update: remove_palette refuses on a built-in and leaves the store alone" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    model.editing_palette = model.palettes.defaultId();
    const before = model.palettes.len;
    update(&model, .remove_palette, &fx);
    try std.testing.expectEqual(before, model.palettes.len);
}
```

- [ ] **Step 2: Run to verify it fails, then implement**

Run: `native test`. Expected: compile error — the Msg arms and model fields do not exist.

Add the fields and arms. Each arm is a short delegation to `palette_store`. Two behaviours the tests pin and that are easy to get wrong:

- `add_palette` and `duplicate_palette` must also **write the new id into the selected node's palette param**, otherwise the user creates a palette and nothing on screen changes. Route that through the existing `setSlotChoice`-style helper rather than writing `params` directly, so the control-kind guard still applies.
- `remove_palette` must repoint `editing_palette` at `defaultId()` when it deletes the palette being edited, or the dialog renders against a dangling id.

Every arm that changes a palette changes rendering, so confirm `changesRender` covers them — it defaults to `true` for unlisted arms, so the risk is accidentally *adding* one to the exclusion list.

- [ ] **Step 3: Write the picker and dialog markup**

In the controls pane, beside the palette `select`, add an "Edit…" button bound to `open_palette_editor`. Then, at the end of the root `column`, the dialog:

```html
<if test="{palette_editor_open}">
  <dialog text="Palettes" on-dismiss="close_palette_editor">
    <column gap="8" padding="12">
      <row gap="6">
        <button size="sm" on-press="add_palette">New</button>
        <button size="sm" on-press="duplicate_palette">Duplicate</button>
        <button size="sm" variant="destructive" on-press="remove_palette"
                disabled="{editingIsBuiltin}">Delete</button>
        <spacer grow="1"/>
        <button size="sm" on-press="close_palette_editor">Done</button>
      </row>
      <separator/>
      <row gap="8" grow="1">
        <scroll min-width="140">
          <column gap="2">
            <for each="paletteRows" key="id" as="p">
              <row padding="4" on-press="select_palette:{p.id}" selected="{p.id == editingPalette}" label="{p.name}">
                <text grow="1">{p.name}</text>
              </row>
            </for>
          </column>
        </scroll>
        <!-- swatch list: Task 5 -->
      </row>
    </column>
  </dialog>
</if>
```

`paletteRows` is a `Model` method returning `self.palettes.items()`; `editingPalette` returns `self.editing_palette`; `editingIsBuiltin` is an explicit predicate. Remember `dialog` is a **stacking** container — `gap` on it is a validation error, hence the inner `column`.

- [ ] **Step 4: Verify and commit**

`native check --strict` clean; `native test` green in both modes. Then drive it with `native automate`: open the editor, confirm the dialog appears in the snapshot with the three built-ins listed, confirm Delete reports `disabled` while a built-in is selected, create a palette and confirm the list grows. Report the real snapshot output.

```bash
git add src/app.native src/main.zig
git commit -m "feat: palette management dialog"
```

---

### Task 5: Swatch editing

**Files:**
- Modify: `src/app.native`, `src/main.zig`
- Create: `src/ui_swatches.zig`

**Interfaces:**
- Consumes: `palette_store`, `hex`.
- Produces: `ui_swatches.Row` (`{ index, hex_buf, hex_len, r, g, b }` with `pub fn hexText()`), `ui_swatches.rowsFor(palette) [max_colors]Row`; Msg arms `add_swatch`, `remove_swatch: u8`, `move_swatch_up: u8`, `move_swatch_down: u8`, `edit_swatch_hex: canvas.TextInputEvent`, `focus_swatch: u8`.

Colour entry is a **hex text field**, matching `PaletteEditor.tsx`. No colour wheel: the SDK has no colour-picker widget, and a hex field is what the web app actually ships.

Note the payload constraint established in plan 1: `on-input` requires a `canvas.TextInputEvent` payload, so it cannot also carry the swatch index. The model therefore tracks a **focused swatch** (`focus_swatch:{index}` on the row) and `edit_swatch_hex` applies to whichever swatch is focused — the same fixed-target pattern the controls panel uses, for the same reason.

- [ ] **Step 1: Write the failing test**

Add to `src/ui_swatches.zig`:

```zig
test "rowsFor renders each colour as the hex string hex.fromRgb01 produces" {
    var store = palette_store.Store.initBuiltins();
    const id = store.duplicate(store.defaultId()).?;
    const rows = rowsFor(store.byId(id).?);
    // gameboy's darkest shade is 0f380f
    try std.testing.expectEqualStrings("#0f380f", rows[0].hexText());
    try std.testing.expectEqual(@as(usize, 4), countVisible(&rows));
}

test "an invalid hex edit leaves the colour untouched" {
    var store = palette_store.Store.initBuiltins();
    const id = store.add().?;
    applyHex(&store, id, 0, "not a colour");
    try std.testing.expectEqual(@as(f32, 0), store.byId(id).?.slice()[0][0]);
    applyHex(&store, id, 0, "#ff0000");
    try std.testing.expectEqual(@as(f32, 1), store.byId(id).?.slice()[0][0]);
}

test "a hex edit round-trips through the row it renders" {
    var store = palette_store.Store.initBuiltins();
    const id = store.add().?;
    applyHex(&store, id, 0, "#8bac0f");
    const rows = rowsFor(store.byId(id).?);
    try std.testing.expectEqualStrings("#8bac0f", rows[0].hexText());
}
```

- [ ] **Step 2: Implement**

`rowsFor` projects a palette's colours into fixed rows carrying their hex text; `applyHex` validates with `hex.isValid` and writes through `store.setColor` only on success. Invalid input is a **silent no-op on the model** — the field keeps showing what the user typed until they fix it, matching `PaletteEditor.tsx`, which only calls `onColor` when `isValidHex` passes.

- [ ] **Step 3: Markup**

Add the swatch column to the dialog: a `<for each="swatchRows">` of rows, each with a `text-field` bound to the row's hex, `▲`/`▼`/`✕` buttons, and a `+` button below bounded by `max_colors`. Every control in a row carries the same `size`, and the icon-only buttons carry a `label`.

- [ ] **Step 4: Verify and commit**

`native check --strict`, `native test` both modes, and an automation pass: duplicate Game Boy, edit a swatch to `#ff0000`, confirm the preview changes. Report real output.

```bash
git add src/ui_swatches.zig src/app.native src/main.zig
git commit -m "feat: swatch editing with hex entry"
```

---

### Task 6: Serialization

**Files:**
- Create: `src/color/palette_file.zig`
- Reference (read-only, other repo): `dithrrd/src/features/paletteStorage.ts`

**Interfaces:**
- Produces: `palette_file.encode(store, writer) !void`, `palette_file.decode(bytes, store: *Store) DecodeStats`, `palette_file.DecodeStats { loaded: usize, skipped: usize }`.

Pure encode/decode over bytes, with **no I/O** — Task 7 owns the file effects. Splitting them means the format is tested exhaustively without touching a disk.

- [ ] **Step 1: Write the failing test**

```zig
test "round-trips custom palettes and omits built-ins" {
    var store = palette_store.Store.initBuiltins();
    const a = store.add().?;
    store.rename(a, "Sunset");
    store.setColor(a, 0, .{ 1, 0, 0 });
    _ = store.addSwatch(a);
    store.setColor(a, 1, .{ 0, 0, 1 });

    var buf: [4096]u8 = undefined;
    var writer = std.Io.Writer.fixed(&buf);
    try encode(&store, &writer);

    var restored = palette_store.Store.initBuiltins();
    const stats = decode(writer.buffered(), &restored);
    try std.testing.expectEqual(@as(usize, 1), stats.loaded);
    try std.testing.expectEqual(@as(usize, 4), restored.len); // 3 built-ins + 1
    const loaded = restored.items()[3];
    try std.testing.expectEqualStrings("Sunset", loaded.name());
    try std.testing.expectEqual(@as(f32, 1), loaded.slice()[0][0]);
    try std.testing.expectEqual(@as(f32, 1), loaded.slice()[1][2]);
}

test "decode survives every malformed input paletteStorage.ts guards against" {
    const cases = [_][]const u8{
        "", "null", "{}", "[", "not json at all",
        "[{\"name\":\"x\"}]",                      // no colors
        "[{\"colors\":[]}]",                       // no name, empty colors
        "[{\"name\":\"x\",\"colors\":\"nope\"}]",  // colors not an array
        "[{\"name\":\"x\",\"colors\":[[1,2]]}]",   // colour not a triple
        "[{\"name\":\"x\",\"colors\":[[\"a\",\"b\",\"c\"]]}]", // non-numeric
    };
    for (cases) |raw| {
        var store = palette_store.Store.initBuiltins();
        const stats = decode(raw, &store);
        try std.testing.expectEqual(@as(usize, 0), stats.loaded);
        // built-ins survive a bad file — the user does not lose the app
        try std.testing.expectEqual(@as(usize, 3), store.len);
    }
}

test "a file with more palettes than fit loads what it can and reports the rest" {
    // Bounded storage means truncation is reachable; it must be
    // reported, not silent.
    var buf: [64 * 1024]u8 = undefined;
    var writer = std.Io.Writer.fixed(&buf);
    var full = palette_store.Store.initBuiltins();
    while (full.len < palette_store.max_palettes) _ = full.add().?;
    try encode(&full, &writer);

    var target = palette_store.Store.initBuiltins();
    _ = target.add().?; // one slot already used, so one entry cannot fit
    const stats = decode(writer.buffered(), &target);
    try std.testing.expect(stats.skipped >= 1);
    try std.testing.expectEqual(palette_store.max_palettes, target.len);
}

test "colours out of 0..1 are clamped rather than rejected" {
    var store = palette_store.Store.initBuiltins();
    const stats = decode("[{\"name\":\"x\",\"colors\":[[2,-1,0.5]]}]", &store);
    try std.testing.expectEqual(@as(usize, 1), stats.loaded);
    const c = store.items()[3].slice()[0];
    try std.testing.expectEqual(@as(f32, 1), c[0]);
    try std.testing.expectEqual(@as(f32, 0), c[1]);
}
```

- [ ] **Step 2: Implement**

Use `std.json` for both directions. The format mirrors `paletteStorage.ts`'s: an array of `{ id, name, colors: [[r,g,b], …] }`. **Ids are not preserved across a load** — they are runtime handles, and a saved id could collide with a built-in's. Write the field for readability and human editing, but assign fresh ids on load; say so in a comment, since a reader will assume otherwise.

`decode` must never fail the caller: a malformed file yields `{ loaded: 0, skipped: n }` and leaves the store as it was. That mirrors `loadCustomPalettes`'s `try/catch → []` and is the difference between "your custom palettes are gone" and "the app will not start".

- [ ] **Step 3: Run and commit**

`native test` both modes. Expected: PASS, +4 tests.

```bash
git add src/color/palette_file.zig
git commit -m "feat: palette JSON serialization"
```

---

### Task 7: Persistence

**Files:**
- Modify: `src/main.zig`
- Create: `docs/persistence.md`

**Interfaces:**
- Consumes: `palette_file`, `Effects.writeFile`/`readFile`.
- Produces: `Msg` arms `palettes_loaded: <file result payload>`, `palettes_saved: <file result payload>`; `Model.palettes_dirty: bool`.

- [ ] **Step 1: Establish the path**

The store lives at `~/Library/Application Support/dithrrd-native/palettes.json`. `fx.writeFile` creates missing parent directories, so no mkdir step is needed.

`HOME` comes from `g_env`, which `main` already stashes (`init.environ_map`) for `DITHRRD_IMAGE`. Build the path into a file-scope buffer once at startup. **If `HOME` is unset, persistence is disabled rather than falling back to a relative path** — a relative path would scatter `palettes.json` into whatever directory the app was launched from. Set a status line saying so.

Record the path, the disable-on-missing-HOME decision, and the format in `docs/persistence.md`.

- [ ] **Step 2: Write the failing test**

```zig
test "update: a successful load merges custom palettes and keeps the built-ins" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    const json = "[{\"name\":\"Sunset\",\"colors\":[[1,0,0]]}]";
    update(&model, .{ .palettes_loaded = fileOk(json) }, &fx);
    try std.testing.expectEqual(@as(usize, 4), model.palettes.len);
    try std.testing.expectEqualStrings("Sunset", model.palettes.items()[3].name());
}

test "update: a failed or malformed load leaves the built-ins intact and says so" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    update(&model, .{ .palettes_loaded = fileErr() }, &fx);
    try std.testing.expectEqual(@as(usize, 3), model.palettes.len);
    update(&model, .{ .palettes_loaded = fileOk("garbage") }, &fx);
    try std.testing.expectEqual(@as(usize, 3), model.palettes.len);
}

test "update: a palette edit marks the store dirty; a completed save clears it" {
    var model: Model = .{};
    var fx = Effects.init(std.testing.allocator);
    defer fx.deinit();
    try std.testing.expectEqual(false, model.palettes_dirty);
    update(&model, .add_palette, &fx);
    try std.testing.expectEqual(true, model.palettes_dirty);
    update(&model, .{ .palettes_saved = fileOk("") }, &fx);
    try std.testing.expectEqual(false, model.palettes_dirty);
}
```

Write `fileOk`/`fileErr` helpers constructing whatever result payload `Effects.fileMsg` actually delivers — read `effects.zig`'s `FileMsgFn` and its result type rather than guessing at the shape.

- [ ] **Step 3: Implement**

- **Load** is issued once from `attachPreviewProducer`, which is the only place holding the runtime at startup. On `ok`, decode into `model.palettes`; on `err` (including a missing file on first launch, which is the normal case and **not** an error worth surfacing), keep the built-ins.
- **Save** is issued whenever `palettes_dirty` is set at the end of `update` — the same shape as `changesRender`, and for the same reason: a per-arm call is a control that silently fails to persist. Use a **fixed effect key** so an in-flight save is superseded rather than queued, matching the keyed-effect discipline the design spec describes.
- Store-on-success: `palettes_dirty` clears only on the `ok` arm. A failed write leaves it set, so the next edit retries.

- [ ] **Step 4: Verify end to end**

Launch the app, create a palette, edit a swatch, quit, relaunch, and confirm the palette is still there with its colours. Then corrupt the file by hand (`echo 'garbage' > …/palettes.json`), relaunch, and confirm the app starts with the three built-ins and a status line rather than failing. Report both.

- [ ] **Step 5: Commit**

```bash
git add src/main.zig docs/persistence.md
git commit -m "feat: persist custom palettes to disk"
```

---

## Out of scope

- **The eyedropper.** `store.ts` has `startEyedropper`/`applyEyedropper` and `PaletteEditor.tsx` has a pipette button. It needs a pointer event on the media surface mapped back to a source-image pixel, which is a viewport concern rather than a palette one, and the media surface is display-only (presses fall through). Defer.
- Import/export of palette files. Plan 3 owns file dialogs; revisit after.
- Presets. Explicitly deferred by the design spec.
- Reordering palettes in the list. The web app does not offer it either.

## Known risks

- **Task 3 is the risky one.** It changes a value flowing from UI to Metal ABI and removes two tables. The three `planPasses` tests written first are the guard; do not weaken them.
- **`Option`'s runtime lifetime.** Projecting store entries into `Slot.options` means slices that must outlive the frame. A dangling slice here shows as garbage palette names, not a crash. Task 3 step 3 calls this out.
- **The seqlock payload grows.** `RenderRequest` is `Stack` + `Store`, ~1.3 KB + ~2 KB. Copy cost is still trivial and the protocol is unchanged, but do not let `Store` acquire a pointer field.
- **`std.json`'s API in Zig 0.16** may not match what you expect. Read it before writing `decode`; the malformed-input test is the gate either way.
