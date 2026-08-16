# Native Stack UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `dithrrd-native` vertical slice — one hardcoded `bayer → atkinson` chain driven by one slider — into a real editor: a reorderable stack of any of the 16 effects, each with its own live controls.

**Architecture:** A comptime effect catalog (`catalog.zig`) is the single source of truth for what an effect is called, what family it belongs to, and what controls it exposes. A pure stack model (`stack.zig`) owns the user's chain and is a direct port of `store.ts` + `sortable.ts`. `plan.zig` turns the stack into `[]Step`, which the already-ported 16 Metal/CPU kernels consume through a widened `execute.zig`. The view is a three-pane markup shell over that model; a background worker renders whole-stack snapshots latest-wins.

**Tech Stack:** Zig 0.16, Vercel Native SDK v0.6.1, Metal (MSL), Native markup (`.native`), macOS only.

This is **plan 1 of 3** for the remaining v1 scope of `docs/superpowers/specs/2026-07-27-native-port-design.md`:

1. **This plan** — catalog, stack model, generic pipeline, three-pane UI, controls.
2. Palette editor, custom palettes, disk persistence.
3. Native open dialog, drag-and-drop, PNG export, menu bar.

## Repo

All work happens in **`/Users/aaron/workspace/dithrrd-native`** (a separate repo from the one holding this plan). It currently sits at `009025c` on `main` with 60 passing tests and 27 golden comparisons.

Reference sources live in the web repo at `/Users/aaron/workspace/dithrrd/src/`. Read them; do not modify them.

## Global Constraints

- **Zig 0.16.0**, SDK pinned at its current path dependency. Do not add dependencies.
- **`native test` must stay green** — currently 60 tests. Never reduce the count without saying why.
- **The 27 golden comparisons are load-bearing and must stay green.** Any change to `execute.zig`, `diffuse.zig`, `device.zig`, or `kernels.metal` that turns a golden red is a bug in the change, not a stale golden. Do not touch `fixtures/`.
- **`Model` is mutated only from `update`, on the loop thread.** The render worker never touches `Model`. This is established in `main.zig`'s `doRender` doc comment and is not negotiable.
- **`native check` must pass** on every `app.native` edit — it validates markup bindings against the model contract.
- **No `any`-equivalent escapes**: no `@ptrCast` around a type mismatch, no `catch unreachable` on a fallible runtime path.
- Effect display names, control labels, ranges, and default values are copied **verbatim** from the web repo's `src/effects/*.ts`. They are user-visible strings; a typo is a defect.
- Comment density matches the existing files: doc comments explain *why*, especially where a value mirrors a web-app decision.

---

### Task 1: The effect catalog

**Files:**
- Create: `src/catalog.zig`
- Reference (read-only, other repo): `dithrrd/src/effects/types.ts`, `dithrrd/src/effects/registry.ts`, `dithrrd/src/effects/*.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `catalog.EffectId` (enum, 16 arms), `catalog.Family`, `catalog.Kind`, `catalog.ControlKind`, `catalog.Option`, `catalog.Control`, `catalog.ParamValue`, `catalog.EffectDef`, `catalog.max_controls` (= 4), `catalog.all` (`[16]EffectDef`), `catalog.def(id) *const EffectDef`, `catalog.defaultParams(id) [max_controls]ParamValue`.

This task is pure data plus lookup. No UI, no pipeline, no allocation.

- [ ] **Step 1: Write the failing test**

Create `src/catalog.zig` containing only these tests (the types come next), so the file fails to compile for a stated reason:

```zig
const std = @import("std");

test "every effect id has a definition, in registry order" {
    try std.testing.expectEqual(@as(usize, 16), all.len);
    for (all, 0..) |entry, i| {
        try std.testing.expectEqual(@as(usize, i), @intFromEnum(entry.id));
    }
    // registry.ts's EFFECT_LIST order, verbatim — this is the order the
    // "Add effect" menu lists them in, so it is user-visible.
    try std.testing.expectEqual(EffectId.grade, all[0].id);
    try std.testing.expectEqual(EffectId.pixelate, all[1].id);
    try std.testing.expectEqual(EffectId.bayer, all[2].id);
    try std.testing.expectEqual(EffectId.per_channel, all[15].id);
}

test "display names are copied verbatim from the web registry" {
    try std.testing.expectEqualStrings("Bayer Dither", def(.bayer).name);
    try std.testing.expectEqualStrings("Floyd–Steinberg", def(.floyd).name);
    try std.testing.expectEqualStrings("Jarvis–Judice–Ninke", def(.jarvis).name);
    try std.testing.expectEqualStrings("Duotone / Multitone", def(.duotone).name);
    try std.testing.expectEqualStrings("Per-Channel (CMYK)", def(.per_channel).name);
    try std.testing.expectEqualStrings("Pixelate + Posterize", def(.pixelate).name);
}

test "no effect declares more controls than max_controls" {
    for (all) |entry| try std.testing.expect(entry.controls.len <= max_controls);
}

test "grade's four sliders carry the web app's ranges and defaults" {
    const controls = def(.grade).controls;
    try std.testing.expectEqual(@as(usize, 4), controls.len);
    try std.testing.expectEqualStrings("Brightness", controls[0].label);
    try std.testing.expectEqual(@as(f32, -0.5), controls[0].min);
    try std.testing.expectEqual(@as(f32, 0.5), controls[0].max);
    try std.testing.expectEqual(@as(f32, 0.01), controls[0].step);
    const params = defaultParams(.grade);
    try std.testing.expectEqual(@as(f32, 0), params[0].number);
    try std.testing.expectEqual(@as(f32, 1), params[1].number); // contrast
}

test "bayer's matrix select carries both options in web order" {
    const matrix = def(.bayer).controls[0];
    try std.testing.expectEqual(ControlKind.select, matrix.kind);
    try std.testing.expectEqual(@as(usize, 2), matrix.options.len);
    try std.testing.expectEqualStrings("4 × 4", matrix.options[0].label);
    try std.testing.expectEqualStrings("8 × 8", matrix.options[1].label);
    // defaultParams({ matrix: '4' }) -> option index 0
    try std.testing.expectEqual(@as(u8, 0), defaultParams(.bayer)[0].choice);
}

test "the six diffusion effects share the levels+serpentine shape" {
    for ([_]EffectId{ .floyd, .atkinson, .jarvis, .stucki, .sierra, .burkes }) |id| {
        const entry = def(id);
        try std.testing.expectEqual(Family.diffusion, entry.family);
        try std.testing.expectEqual(Kind.cpu, entry.kind);
        try std.testing.expectEqual(@as(usize, 2), entry.controls.len);
        try std.testing.expectEqualStrings("Levels", entry.controls[0].label);
        try std.testing.expectEqual(ControlKind.toggle, entry.controls[1].kind);
        try std.testing.expectEqual(@as(f32, 2), defaultParams(id)[0].number);
        try std.testing.expectEqual(true, defaultParams(id)[1].flag);
    }
}

test "every option's index equals its position" {
    for (all) |entry| {
        for (entry.controls) |control| {
            for (control.options, 0..) |option, i| {
                try std.testing.expectEqual(@as(u8, @intCast(i)), option.index);
            }
        }
    }
}

test "only the six diffusion effects are CPU effects" {
    var cpu_count: usize = 0;
    for (all) |entry| if (entry.kind == .cpu) {
        cpu_count += 1;
    };
    try std.testing.expectEqual(@as(usize, 6), cpu_count);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/aaron/workspace/dithrrd-native && native test`
Expected: compile error — `all`, `def`, `EffectId`, etc. are undefined. (`build.zig`'s `writeTestAggregate` globs `src/`, so the new file is picked up with no import edit; see `docs/testing.md`.)

- [ ] **Step 3: Write the types**

Prepend to `src/catalog.zig`:

```zig
//! The effect catalog: one comptime table that is the source of truth
//! for what an effect is called, which family it belongs to, whether it
//! runs on the GPU or the CPU, and which controls it exposes. Ported
//! from the web app's `src/effects/*.ts` + `src/effects/registry.ts`,
//! whose 16 modules each carried their own `defaultParams` and
//! `controls` array beside their shader source.
//!
//! Why one table rather than 16 files: with a single language tier
//! there is no TS/Zig mirror to keep in sync, so the design spec chose
//! a comptime table — "adding an effect means editing one file because
//! there is only one file". The kernels themselves already live
//! elsewhere (`pipeline/kernels.metal`, `pipeline/diffuse.zig`); this
//! file is metadata only and deliberately holds no rendering code.
//!
//! Every string, range, and default here is copied VERBATIM from the
//! web app. They are user-visible, and the goldens in `fixtures/` were
//! generated against these exact defaults — a "tidied" range here is a
//! silent behavioural change.

pub const Family = enum { color, ordered, diffusion, halftone, pixelate };

/// Which side of the pipeline runs it. `gpu` effects are Metal compute
/// dispatches; `cpu` effects are the six error-diffusion kernels, which
/// are inherently serial and force the GPU→CPU→GPU readback hop (see
/// `pipeline/execute.zig`'s `renderChain`).
pub const Kind = enum { gpu, cpu };

/// Mirrors `types.ts`'s `Control` union. `angle` is a slider with a
/// fixed 0..360 range and a degree suffix, kept distinct from `slider`
/// because the pipeline converts it to radians (`uAngle: p.angle * PI /
/// 180`) and the readout appends "°".
pub const ControlKind = enum { slider, angle, toggle, select, palette };

/// `index` is the option's own position in its control's `options`
/// array, carried redundantly because markup dispatches an option pick
/// as `pick_choice_0:{o.index}` and a `<for>` item cannot bind its own
/// position. The "every option's index equals its position" test below
/// is the guard against a hand-numbered literal drifting from its slot.
pub const Option = struct { label: []const u8, value: []const u8, index: u8 };

/// One control on one effect. `min`/`max`/`step` are meaningful for
/// `slider` only — `angle` is always 0..360 step 1, and the other kinds
/// ignore them.
pub const Control = struct {
    key: []const u8,
    label: []const u8,
    kind: ControlKind,
    min: f32 = 0,
    max: f32 = 1,
    step: f32 = 1,
    options: []const Option = &.{},
    default: ParamValue,
};

/// A parameter's runtime value. `types.ts` used a bare
/// `number | string | boolean`; the string arm existed only to name a
/// `select` option or a palette id, so this splits those into a
/// positional `choice` index and a `palette` id — both cheaper to store
/// in a POD stack node and impossible to mistype.
pub const ParamValue = union(enum) {
    number: f32,
    flag: bool,
    /// Index into the owning control's `options`.
    choice: u8,
    /// Index into the palette table. Plan 2 replaces this with a real
    /// palette id once custom palettes exist; until then it indexes
    /// `color/palettes.zig`'s built-ins.
    palette: u8,
};

/// The widest control list in the catalog: `grade` (brightness,
/// contrast, gamma, saturation) and `pixelate` (pixel size, levels,
/// sampling, dither) both declare four. The controls panel lays out
/// exactly this many fixed slots — see Task 6 for why the slot count is
/// static.
pub const max_controls: usize = 4;

/// Registry order — `registry.ts`'s `EFFECT_LIST`, verbatim. This is
/// the order the "Add effect" menu presents, so it is user-visible and
/// not merely internal.
pub const EffectId = enum(u8) {
    grade,
    pixelate,
    bayer,
    halftone,
    palette,
    floyd,
    atkinson,
    jarvis,
    stucki,
    sierra,
    burkes,
    clustered_dot,
    line_screen,
    crosshatch,
    duotone,
    per_channel,
};

pub const EffectDef = struct {
    id: EffectId,
    /// `type` in the web app — the stable machine identifier, used by
    /// preset/share serialisation there and kept here so plan 3's
    /// export and any future persistence have a name that survives
    /// reordering the enum.
    slug: []const u8,
    name: []const u8,
    family: Family,
    kind: Kind,
    controls: []const Control,
};

pub fn def(id: EffectId) *const EffectDef {
    return &all[@intFromEnum(id)];
}

/// The effect's `defaultParams` as a positional array, indexed the same
/// way `controls` is. Slots past `controls.len` are `.{ .number = 0 }`
/// filler and are never read — `stack.Node` carries a fixed-size array
/// so it stays POD and copyable into a render snapshot without an
/// allocator.
pub fn defaultParams(id: EffectId) [max_controls]ParamValue {
    var out: [max_controls]ParamValue = @splat(ParamValue{ .number = 0 });
    for (def(id).controls, 0..) |control, i| out[i] = control.default;
    return out;
}
```

- [ ] **Step 4: Write the table**

Add to `src/catalog.zig`, above the tests. The six diffusion effects share a controls array; every other effect gets its own. Copy each range from the web source named in the comment.

```zig
/// `{ type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8,
/// step: 1 }` + `{ type: 'toggle', key: 'serpentine', label:
/// 'Serpentine' }`, with `defaultParams = { levels: 2, serpentine: true
/// }` — identical across all six diffusion modules
/// (`floydSteinberg.ts`, `atkinson.ts`, `jarvis.ts`, `stucki.ts`,
/// `sierra.ts`, `burkes.ts`), so it is declared once here rather than
/// copy-pasted six times.
const diffusion_controls: []const Control = &.{
    .{ .key = "levels", .label = "Levels", .kind = .slider, .min = 2, .max = 8, .step = 1, .default = .{ .number = 2 } },
    .{ .key = "serpentine", .label = "Serpentine", .kind = .toggle, .default = .{ .flag = true } },
};

fn diffusionDef(id: EffectId, slug: []const u8, name: []const u8) EffectDef {
    return .{ .id = id, .slug = slug, .name = name, .family = .diffusion, .kind = .cpu, .controls = diffusion_controls };
}

pub const all: [16]EffectDef = .{
    // grade.ts
    .{ .id = .grade, .slug = "grade", .name = "Grade", .family = .color, .kind = .gpu, .controls = &.{
        .{ .key = "brightness", .label = "Brightness", .kind = .slider, .min = -0.5, .max = 0.5, .step = 0.01, .default = .{ .number = 0 } },
        .{ .key = "contrast", .label = "Contrast", .kind = .slider, .min = 0, .max = 2, .step = 0.01, .default = .{ .number = 1 } },
        .{ .key = "gamma", .label = "Gamma", .kind = .slider, .min = 0.2, .max = 3, .step = 0.01, .default = .{ .number = 1 } },
        .{ .key = "saturation", .label = "Saturation", .kind = .slider, .min = 0, .max = 2, .step = 0.01, .default = .{ .number = 1 } },
    } },
    // pixelate.ts
    .{ .id = .pixelate, .slug = "pixelate", .name = "Pixelate + Posterize", .family = .pixelate, .kind = .gpu, .controls = &.{
        .{ .key = "pixelSize", .label = "Pixel Size", .kind = .slider, .min = 1, .max = 64, .step = 1, .default = .{ .number = 4 } },
        .{ .key = "levels", .label = "Levels", .kind = .slider, .min = 2, .max = 16, .step = 1, .default = .{ .number = 4 } },
        .{ .key = "sampling", .label = "Sampling", .kind = .select, .options = &.{
            .{ .label = "Nearest", .value = "nearest", .index = 0 },
            .{ .label = "Average", .value = "average", .index = 1 },
        }, .default = .{ .choice = 0 } },
        .{ .key = "dither", .label = "Dither before quantize", .kind = .toggle, .default = .{ .flag = false } },
    } },
    // bayer.ts
    .{ .id = .bayer, .slug = "bayer", .name = "Bayer Dither", .family = .ordered, .kind = .gpu, .controls = &.{
        .{ .key = "matrix", .label = "Matrix", .kind = .select, .options = &.{
            .{ .label = "4 × 4", .value = "4", .index = 0 },
            .{ .label = "8 × 8", .value = "8", .index = 1 },
        }, .default = .{ .choice = 0 } },
        .{ .key = "levels", .label = "Levels", .kind = .slider, .min = 2, .max = 8, .step = 1, .default = .{ .number = 2 } },
    } },
    // halftone.ts
    .{ .id = .halftone, .slug = "halftone", .name = "Halftone", .family = .halftone, .kind = .gpu, .controls = &.{
        .{ .key = "cellSize", .label = "Cell Size", .kind = .slider, .min = 2, .max = 40, .step = 1, .default = .{ .number = 8 } },
        .{ .key = "angle", .label = "Angle", .kind = .angle, .default = .{ .number = 45 } },
    } },
    // palette.ts — `paletteEffect`, whose `type` is 'palette'
    .{ .id = .palette, .slug = "palette", .name = "Palette Map", .family = .color, .kind = .gpu, .controls = &.{
        .{ .key = "paletteId", .label = "Palette", .kind = .palette, .default = .{ .palette = default_palette_index } },
    } },
    diffusionDef(.floyd, "floyd", "Floyd–Steinberg"),
    diffusionDef(.atkinson, "atkinson", "Atkinson"),
    diffusionDef(.jarvis, "jarvis", "Jarvis–Judice–Ninke"),
    diffusionDef(.stucki, "stucki", "Stucki"),
    diffusionDef(.sierra, "sierra", "Sierra"),
    diffusionDef(.burkes, "burkes", "Burkes"),
    // clusteredDot.ts
    .{ .id = .clustered_dot, .slug = "clusteredDot", .name = "Clustered Dot", .family = .ordered, .kind = .gpu, .controls = &.{
        .{ .key = "levels", .label = "Levels", .kind = .slider, .min = 2, .max = 8, .step = 1, .default = .{ .number = 2 } },
    } },
    // lineScreen.ts
    .{ .id = .line_screen, .slug = "lineScreen", .name = "Line Screen", .family = .halftone, .kind = .gpu, .controls = &.{
        .{ .key = "cellSize", .label = "Pitch", .kind = .slider, .min = 2, .max = 40, .step = 1, .default = .{ .number = 8 } },
        .{ .key = "angle", .label = "Angle", .kind = .angle, .default = .{ .number = 45 } },
    } },
    // crosshatch.ts — note the DIFFERENT pitch range from lineScreen
    .{ .id = .crosshatch, .slug = "crosshatch", .name = "Crosshatch", .family = .halftone, .kind = .gpu, .controls = &.{
        .{ .key = "cellSize", .label = "Pitch", .kind = .slider, .min = 3, .max = 30, .step = 1, .default = .{ .number = 6 } },
        .{ .key = "angle", .label = "Angle", .kind = .angle, .default = .{ .number = 0 } },
    } },
    // duotone.ts
    .{ .id = .duotone, .slug = "duotone", .name = "Duotone / Multitone", .family = .color, .kind = .gpu, .controls = &.{
        .{ .key = "paletteId", .label = "Ramp", .kind = .palette, .default = .{ .palette = default_palette_index } },
    } },
    // perChannel.ts
    .{ .id = .per_channel, .slug = "perChannel", .name = "Per-Channel (CMYK)", .family = .ordered, .kind = .gpu, .controls = &.{
        .{ .key = "levels", .label = "Levels", .kind = .slider, .min = 2, .max = 8, .step = 1, .default = .{ .number = 2 } },
        .{ .key = "angle", .label = "Angle", .kind = .angle, .default = .{ .number = 0 } },
        .{ .key = "scale", .label = "Dot Scale", .kind = .slider, .min = 1, .max = 8, .step = 1, .default = .{ .number = 1 } },
    } },
};

/// Both palette-driven effects default to `paletteId: 'gameboy'`. The
/// built-in table in `color/palettes.zig` lists bw, gray4, gameboy in
/// that order, so gameboy is index 2. Plan 2 replaces this positional
/// index with a real id once custom palettes can be added and removed.
const default_palette_index: u8 = 2;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `native test`
Expected: PASS, with 7 new tests on top of the existing 60.

- [ ] **Step 6: Commit**

```bash
git add src/catalog.zig
git commit -m "feat: comptime effect catalog for all 16 effects"
```

---

### Task 2: The stack model

**Files:**
- Create: `src/stack.zig`
- Reference (read-only, other repo): `dithrrd/src/store/store.ts`, `dithrrd/src/ui/sortable.ts`, `dithrrd/src/store/store.test.ts`

**Interfaces:**
- Consumes: `catalog.EffectId`, `catalog.ParamValue`, `catalog.max_controls`, `catalog.defaultParams`.
- Produces: `stack.Node` (`{ id: u32, effect: catalog.EffectId, enabled: bool, params: [catalog.max_controls]catalog.ParamValue }`), `stack.Stack` with `nodes: [max_nodes]Node`, `len: usize`, `selected: ?u32`, `next_id: u32`, and methods `add(EffectId) ?u32`, `remove(u32)`, `toggle(u32)`, `move(u32, i32)`, `duplicate(u32) ?u32`, `setParam(u32, usize, ParamValue)`, `select(?u32)`, `indexOf(u32) ?usize`, `items() []const Node`, `selectedNode() ?*const Node`, `clear()`. `stack.max_nodes` = 32.

Pure state transitions. No allocator, no I/O, no rendering. `Stack` is POD and copyable by value — Task 7's render worker depends on that.

- [ ] **Step 1: Write the failing test**

Create `src/stack.zig` with only these tests:

```zig
const std = @import("std");
const catalog = @import("catalog.zig");

test "add appends a node with catalog defaults and selects it" {
    var s: Stack = .{};
    const id = s.add(.bayer).?;
    try std.testing.expectEqual(@as(usize, 1), s.len);
    try std.testing.expectEqual(catalog.EffectId.bayer, s.items()[0].effect);
    try std.testing.expectEqual(true, s.items()[0].enabled);
    try std.testing.expectEqual(id, s.selected.?);
    try std.testing.expectEqual(@as(f32, 2), s.items()[0].params[1].number); // levels
}

test "ids are never reused after a removal" {
    var s: Stack = .{};
    const first = s.add(.bayer).?;
    s.remove(first);
    const second = s.add(.grade).?;
    try std.testing.expect(first != second);
    try std.testing.expectEqual(@as(usize, 1), s.len);
}

test "remove clears the selection only when the removed node was selected" {
    var s: Stack = .{};
    const a = s.add(.bayer).?;
    const b = s.add(.grade).?;
    s.select(a);
    s.remove(b);
    try std.testing.expectEqual(a, s.selected.?);
    s.remove(a);
    try std.testing.expectEqual(@as(?u32, null), s.selected);
}

test "toggle flips enabled without touching order or selection" {
    var s: Stack = .{};
    const id = s.add(.bayer).?;
    s.toggle(id);
    try std.testing.expectEqual(false, s.items()[0].enabled);
    s.toggle(id);
    try std.testing.expectEqual(true, s.items()[0].enabled);
    try std.testing.expectEqual(id, s.selected.?);
}

test "move shifts a node by the given delta and preserves every other node's order" {
    var s: Stack = .{};
    const a = s.add(.grade).?;
    const b = s.add(.bayer).?;
    const c = s.add(.halftone).?;
    s.move(c, -1); // c up one: a, c, b
    try std.testing.expectEqual(a, s.items()[0].id);
    try std.testing.expectEqual(c, s.items()[1].id);
    try std.testing.expectEqual(b, s.items()[2].id);
    s.move(a, 2); // a down two: c, b, a
    try std.testing.expectEqual(c, s.items()[0].id);
    try std.testing.expectEqual(b, s.items()[1].id);
    try std.testing.expectEqual(a, s.items()[2].id);
}

test "move clamps at both ends instead of wrapping" {
    var s: Stack = .{};
    const a = s.add(.grade).?;
    const b = s.add(.bayer).?;
    s.move(a, -5);
    try std.testing.expectEqual(a, s.items()[0].id);
    s.move(b, 9);
    try std.testing.expectEqual(b, s.items()[1].id);
}

test "duplicate inserts a copy directly after the original and selects it" {
    var s: Stack = .{};
    const a = s.add(.bayer).?;
    const b = s.add(.grade).?;
    s.setParam(a, 1, .{ .number = 7 });
    const copy = s.duplicate(a).?;
    try std.testing.expectEqual(@as(usize, 3), s.len);
    try std.testing.expectEqual(a, s.items()[0].id);
    try std.testing.expectEqual(copy, s.items()[1].id);
    try std.testing.expectEqual(b, s.items()[2].id);
    try std.testing.expectEqual(@as(f32, 7), s.items()[1].params[1].number);
    try std.testing.expectEqual(copy, s.selected.?);
    try std.testing.expect(copy != a);
}

test "setParam writes one slot and leaves its siblings alone" {
    var s: Stack = .{};
    const id = s.add(.grade).?;
    s.setParam(id, 2, .{ .number = 2.5 });
    try std.testing.expectEqual(@as(f32, 2.5), s.items()[0].params[2].number);
    try std.testing.expectEqual(@as(f32, 0), s.items()[0].params[0].number);
    try std.testing.expectEqual(@as(f32, 1), s.items()[0].params[1].number);
}

test "operations on an unknown id are silent no-ops" {
    var s: Stack = .{};
    const id = s.add(.bayer).?;
    s.remove(999);
    s.toggle(999);
    s.move(999, 1);
    s.setParam(999, 0, .{ .number = 5 });
    try std.testing.expectEqual(@as(?u32, null), s.duplicate(999));
    try std.testing.expectEqual(@as(usize, 1), s.len);
    try std.testing.expectEqual(id, s.items()[0].id);
}

test "add refuses to exceed max_nodes and reports it by returning null" {
    var s: Stack = .{};
    for (0..max_nodes) |_| try std.testing.expect(s.add(.bayer) != null);
    try std.testing.expectEqual(@as(?u32, null), s.add(.bayer));
    try std.testing.expectEqual(max_nodes, s.len);
}

test "a Stack copies by value — the copy is independent" {
    var s: Stack = .{};
    const id = s.add(.bayer).?;
    var snapshot = s;
    s.setParam(id, 1, .{ .number = 8 });
    try std.testing.expectEqual(@as(f32, 2), snapshot.items()[0].params[1].number);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `native test`
Expected: compile error — `Stack`, `max_nodes` undefined.

- [ ] **Step 3: Write the implementation**

Prepend to `src/stack.zig`:

```zig
//! The user's effect chain: a fixed-capacity, POD, copyable list of
//! nodes. Ported from the web app's `src/store/store.ts` (the zustand
//! actions become methods) and `src/ui/sortable.ts` (drag-reorder
//! becomes `move`'s index math — the SDK's markup has no drag gesture,
//! so the stack panel drives this with ▲/▼ buttons instead; see the
//! plan's design notes).
//!
//! **Fixed capacity, no allocator, no pointers.** `Stack` is a plain
//! value type so the render worker can take a whole-stack SNAPSHOT by
//! assignment (`var snapshot = model.stack;`) under a brief lock and
//! then render from it for as long as it likes, with no risk of the
//! loop thread mutating the list out from under it and no lifetime to
//! manage. `main.zig`'s threading design depends on this property —
//! adding a heap-allocated field here would silently break it.
//!
//! Ids, not indices, are the stable handle: markup dispatches
//! `remove_node:{n.id}` from a `<for>` row, and by the time that Msg is
//! processed the list may have been reordered. Every method that takes
//! an id resolves it through `indexOf` and no-ops if it is gone,
//! matching the web store's `stack.filter`/`stack.map` behaviour for a
//! stale id.

const std = @import("std");
const catalog = @import("catalog.zig");

/// The stack panel is a scrolling list, so this is a sanity ceiling
/// rather than a UI constraint. A 32-effect chain at the preview cap
/// would already be far past interactive; the web app has no limit
/// because a JS array has none, not because 32 was ever near.
pub const max_nodes: usize = 32;

pub const Node = struct {
    id: u32,
    effect: catalog.EffectId,
    enabled: bool = true,
    params: [catalog.max_controls]catalog.ParamValue,

    /// Bound by markup as `{n.name}` — the catalog's display name.
    pub fn name(self: *const Node) []const u8 {
        return catalog.def(self.effect).name;
    }
};

pub const Stack = struct {
    nodes: [max_nodes]Node = undefined,
    len: usize = 0,
    selected: ?u32 = null,
    /// Monotonic. Never reused after a removal: a stale
    /// `remove_node:{id}` Msg that arrives after its node is gone must
    /// not delete whatever took its place.
    next_id: u32 = 1,

    pub fn items(self: *const Stack) []const Node {
        return self.nodes[0..self.len];
    }

    pub fn indexOf(self: *const Stack, id: u32) ?usize {
        for (self.items(), 0..) |node, i| if (node.id == id) return i;
        return null;
    }

    pub fn add(self: *Stack, effect: catalog.EffectId) ?u32 {
        if (self.len == max_nodes) return null;
        const id = self.next_id;
        self.next_id += 1;
        self.nodes[self.len] = .{ .id = id, .effect = effect, .params = catalog.defaultParams(effect) };
        self.len += 1;
        self.selected = id;
        return id;
    }

    pub fn remove(self: *Stack, id: u32) void {
        const index = self.indexOf(id) orelse return;
        for (index..self.len - 1) |i| self.nodes[i] = self.nodes[i + 1];
        self.len -= 1;
        if (self.selected == id) self.selected = null;
    }

    pub fn toggle(self: *Stack, id: u32) void {
        const index = self.indexOf(id) orelse return;
        self.nodes[index].enabled = !self.nodes[index].enabled;
    }

    /// Shift the node `delta` positions, clamped at both ends. The web
    /// app computed a target index from a drag's drop position and
    /// called `reorderNode(from, to)`; with ▲/▼ buttons the delta is
    /// always ±1, but the signature takes any delta so a later keyboard
    /// "move to top" needs no new method.
    pub fn move(self: *Stack, id: u32, delta: i32) void {
        const from = self.indexOf(id) orelse return;
        const signed: i64 = @as(i64, @intCast(from)) + delta;
        const last: i64 = @intCast(self.len - 1);
        const to: usize = @intCast(std.math.clamp(signed, 0, last));
        if (to == from) return;
        const moved = self.nodes[from];
        if (to > from) {
            for (from..to) |i| self.nodes[i] = self.nodes[i + 1];
        } else {
            var i = from;
            while (i > to) : (i -= 1) self.nodes[i] = self.nodes[i - 1];
        }
        self.nodes[to] = moved;
    }

    /// Insert a copy directly after the original, carrying its current
    /// params — matching `store.ts`'s `duplicateNode`, which splices at
    /// `index + 1` rather than appending.
    pub fn duplicate(self: *Stack, id: u32) ?u32 {
        if (self.len == max_nodes) return null;
        const index = self.indexOf(id) orelse return null;
        const copy_id = self.next_id;
        self.next_id += 1;
        var i = self.len;
        while (i > index + 1) : (i -= 1) self.nodes[i] = self.nodes[i - 1];
        self.nodes[index + 1] = self.nodes[index];
        self.nodes[index + 1].id = copy_id;
        self.len += 1;
        self.selected = copy_id;
        return copy_id;
    }

    /// `slot` indexes the effect's own `controls` array positionally —
    /// the same index the controls panel's slot N renders. Out-of-range
    /// slots are ignored rather than asserted: the markup's slot count
    /// is static (`catalog.max_controls`) while an effect's control
    /// count is not, so a dispatch for an unused slot is reachable and
    /// is not a programming error.
    pub fn setParam(self: *Stack, id: u32, slot: usize, value: catalog.ParamValue) void {
        if (slot >= catalog.max_controls) return;
        const index = self.indexOf(id) orelse return;
        if (slot >= catalog.def(self.nodes[index].effect).controls.len) return;
        self.nodes[index].params[slot] = value;
    }

    pub fn select(self: *Stack, id: ?u32) void {
        if (id) |value| {
            if (self.indexOf(value) == null) return;
        }
        self.selected = id;
    }

    pub fn selectedNode(self: *const Stack) ?*const Node {
        const id = self.selected orelse return null;
        const index = self.indexOf(id) orelse return null;
        return &self.nodes[index];
    }

    pub fn clear(self: *Stack) void {
        self.len = 0;
        self.selected = null;
    }
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `native test`
Expected: PASS, 11 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/stack.zig
git commit -m "feat: stack model with add/remove/reorder/duplicate/params"
```

---

### Task 3: Plan a stack into pipeline steps

**Files:**
- Modify: `src/pipeline/execute.zig` (widen `EffectKind` and `Step`; extend `renderChain`'s switch)
- Create: `src/pipeline/plan.zig`
- Reference (read-only, other repo): `dithrrd/src/engine/planPasses.ts`, `dithrrd/src/effects/*.ts` (the `uniforms` functions)

**Interfaces:**
- Consumes: `catalog`, `stack.Stack`, the existing `pipeline.render*` functions and `diffuse.*` kernels.
- Produces: `execute.Step` widened to 16 arms named after `catalog.EffectId`; `plan.planPasses(s: *const stack.Stack, out: []execute.Step) []execute.Step`.

The 16 kernels already exist and are golden-verified. This task only makes them reachable from a `Stack`. **The gate is that all 27 golden comparisons stay green.**

- [ ] **Step 1: Write the failing test**

Create `src/pipeline/plan.zig` with only these tests:

```zig
const std = @import("std");
const catalog = @import("../catalog.zig");
const stack_mod = @import("../stack.zig");
const execute = @import("execute.zig");

test "planPasses skips disabled nodes and preserves order" {
    var s: stack_mod.Stack = .{};
    const a = s.add(.grade).?;
    const b = s.add(.bayer).?;
    _ = s.add(.atkinson).?;
    s.toggle(b);
    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    const steps = planPasses(&s, &buf);
    try std.testing.expectEqual(@as(usize, 2), steps.len);
    try std.testing.expectEqual(execute.EffectKind.grade, @as(execute.EffectKind, steps[0]));
    try std.testing.expectEqual(execute.EffectKind.atkinson, @as(execute.EffectKind, steps[1]));
    _ = a;
}

test "an empty or fully disabled stack plans zero steps" {
    var s: stack_mod.Stack = .{};
    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    try std.testing.expectEqual(@as(usize, 0), planPasses(&s, &buf).len);
    const id = s.add(.bayer).?;
    s.toggle(id);
    try std.testing.expectEqual(@as(usize, 0), planPasses(&s, &buf).len);
}

test "bayer's matrix choice index maps onto the kernel's 4/8 threshold" {
    var s: stack_mod.Stack = .{};
    const id = s.add(.bayer).?;
    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    try std.testing.expectEqual(@as(u8, 4), planPasses(&s, &buf)[0].bayer.matrix);
    s.setParam(id, 0, .{ .choice = 1 });
    try std.testing.expectEqual(@as(u8, 8), planPasses(&s, &buf)[0].bayer.matrix);
}

test "angle params are converted to radians, matching the web uniforms()" {
    // `device.zig`'s HalftoneParams documents `angle` as RADIANS,
    // "pre-resolved from degrees on the host (mirrors dithrrd's
    // uniforms(): uAngle: (Number(p.angle) * Math.PI) / 180)". The
    // catalog stores degrees because that is what the UI shows; this
    // conversion is planPasses' job, exactly as it was `uniforms()`'s.
    var s: stack_mod.Stack = .{};
    const id = s.add(.halftone).?;
    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    const expected: f32 = @floatCast(45.0 * std.math.pi / 180.0);
    try std.testing.expectApproxEqAbs(expected, planPasses(&s, &buf)[0].halftone.angle, 1e-6);
    s.setParam(id, 1, .{ .number = 0 });
    try std.testing.expectEqual(@as(f32, 0), planPasses(&s, &buf)[0].halftone.angle);
}

test "a palette param resolves to real colours in the step's PaletteParams" {
    var s: stack_mod.Stack = .{};
    _ = s.add(.duotone).?;
    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    // default_palette_index is gameboy, which has 4 colours
    try std.testing.expectEqual(@as(i32, 4), planPasses(&s, &buf)[0].duotone.count);
}

test "every catalog effect plans to a step of its own kind" {
    var buf: [stack_mod.max_nodes]execute.Step = undefined;
    for (catalog.all) |entry| {
        var s: stack_mod.Stack = .{};
        _ = s.add(entry.id).?;
        const steps = planPasses(&s, &buf);
        try std.testing.expectEqual(@as(usize, 1), steps.len);
        // The Step union's tag order mirrors EffectId's, so a missing
        // arm is a compile error and a mis-wired arm is this failure.
        try std.testing.expectEqual(@intFromEnum(entry.id), @intFromEnum(@as(execute.EffectKind, steps[0])));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `native test`
Expected: compile error — `planPasses` undefined, and `execute.EffectKind` has only `gpu_bayer`/`cpu_atkinson`.

- [ ] **Step 3: Widen the Step union**

In `src/pipeline/execute.zig`, replace lines 283-293 (the `EffectKind`, the two param structs, and `Step`) with a 16-arm union whose tag order **mirrors `catalog.EffectId` exactly** — the test above asserts that correspondence by integer value, and keeping them aligned makes a missing arm a compile error.

```zig
/// One step in a render chain. The tag order mirrors
/// `catalog.EffectId` exactly (asserted in plan.zig's tests), so the
/// two enums can be converted by integer value and a newly added effect
/// cannot silently plan to the wrong kernel.
pub const EffectKind = enum(u8) {
    grade,
    pixelate,
    bayer,
    halftone,
    palette,
    floyd,
    atkinson,
    jarvis,
    stucki,
    sierra,
    burkes,
    clustered_dot,
    line_screen,
    crosshatch,
    duotone,
    per_channel,
};

/// A GPU step carries the SAME `extern struct` the kernel already
/// takes — `device.zig`'s param structs are the Metal ABI and there is
/// nothing to translate at dispatch time. That pushes every conversion
/// (degrees→radians, option index→4.0/8.0, palette index→colours) into
/// `plan.zig`, which is exactly where the web app did it too: its
/// per-effect `uniforms(params, ctx)` functions. `plan.zig` IS the port
/// of those 16 functions.
///
/// The six diffusion kernels have no Metal ABI, so they get the one
/// shape they all share.
pub const DiffusionStepParams = struct { levels: u32, serpentine: bool };

pub const Step = union(EffectKind) {
    grade: GradeParams,
    pixelate: PixelateParams,
    bayer: BayerParams,
    halftone: HalftoneParams,
    palette: PaletteParams,
    floyd: DiffusionStepParams,
    atkinson: DiffusionStepParams,
    jarvis: DiffusionStepParams,
    stucki: DiffusionStepParams,
    sierra: DiffusionStepParams,
    burkes: DiffusionStepParams,
    clustered_dot: ClusteredDotParams,
    line_screen: LineScreenParams,
    crosshatch: CrosshatchParams,
    duotone: PaletteParams,
    per_channel: PerChannelParams,
};
```

`BayerParams` is not currently re-exported from `execute.zig` (only `GradeParams`, `PaletteParams`, `PixelateParams`, `ClusteredDotParams`, `HalftoneParams`, `LineScreenParams`, `CrosshatchParams`, `PerChannelParams` are, at lines 26-33). Add `pub const BayerParams = device_mod.BayerParams;` beside them.

Note the union is ~200 bytes wide because `PaletteParams` carries `[16][3]f32` inline. A `[32]Step` step buffer is therefore ~6 KB — fine as a stack local in `doRender`, but do not put one on the `Model`.

- [ ] **Step 3b: Extend renderChain's switch**

Replace the two-arm switch body in `renderChain` with all sixteen. Every GPU arm is a dispatch followed by `pool.swap()` — the "pool.src is always current" invariant the function's doc comment already documents. Every diffusion arm goes through one shared helper so the readback hop is written once:

```zig
    for (steps) |step| {
        switch (step) {
            .grade => |p| {
                gpu.dispatchGrade(pool.src, pool.dst, p);
                pool.swap();
            },
            .pixelate => |p| {
                gpu.dispatchPixelate(pool.src, pool.dst, p);
                pool.swap();
            },
            .bayer => |p| {
                gpu.dispatchBayer(pool.src, pool.dst, p);
                pool.swap();
            },
            .halftone => |p| {
                gpu.dispatchHalftone(pool.src, pool.dst, p);
                pool.swap();
            },
            .palette => |p| {
                gpu.dispatchPalette(pool.src, pool.dst, p);
                pool.swap();
            },
            .clustered_dot => |p| {
                gpu.dispatchClusteredDot(pool.src, pool.dst, p);
                pool.swap();
            },
            .line_screen => |p| {
                gpu.dispatchLineScreen(pool.src, pool.dst, p);
                pool.swap();
            },
            .crosshatch => |p| {
                gpu.dispatchCrosshatch(pool.src, pool.dst, p);
                pool.swap();
            },
            .duotone => |p| {
                gpu.dispatchDuotone(pool.src, pool.dst, p);
                pool.swap();
            },
            .per_channel => |p| {
                gpu.dispatchPerChannel(pool.src, pool.dst, p);
                pool.swap();
            },
            .floyd => |p| try runDiffusion(allocator, pool, width, height, diffuse.floyd, p),
            .atkinson => |p| try runDiffusion(allocator, pool, width, height, diffuse.atkinson, p),
            .jarvis => |p| try runDiffusion(allocator, pool, width, height, diffuse.jarvis, p),
            .stucki => |p| try runDiffusion(allocator, pool, width, height, diffuse.stucki, p),
            .sierra => |p| try runDiffusion(allocator, pool, width, height, diffuse.sierra, p),
            .burkes => |p| try runDiffusion(allocator, pool, width, height, diffuse.burkes, p),
        }
    }
```

and, above `renderChain`:

```zig
/// The GPU→CPU→GPU readback hop, shared by all six diffusion kernels.
/// Download `pool.src` to a plain RGBA8 buffer, run the serial kernel
/// on it in place, re-upload so the next step finds "the current image"
/// where it expects it. This is `execute.ts`'s `current =
/// backend.uploadPixels(out, width, height)`, and it is the one cost
/// the native port reduces rather than removes (see the design spec's
/// "Where the latency actually goes").
///
/// `kernel` is a function pointer rather than six copies of this body:
/// every `diffuse.*` entry point shares the signature
/// `(Allocator, []u8, usize, usize, u32, bool) !void`.
const DiffusionFn = *const fn (std.mem.Allocator, []u8, usize, usize, u32, bool) anyerror!void;

fn runDiffusion(
    allocator: std.mem.Allocator,
    pool: *TexturePool,
    width: usize,
    height: usize,
    kernel: DiffusionFn,
    params: DiffusionStepParams,
) !void {
    const buf = try allocator.alloc(u8, width * height * 4);
    defer allocator.free(buf);
    pool.src.download(buf);
    try kernel(allocator, buf, width, height, params.levels, params.serpentine);
    pool.src.upload(buf);
}
```

Confirm `DiffusionFn`'s signature against `src/pipeline/diffuse.zig`'s actual `pub fn floyd(...)` before writing it; if the six differ in error set, widen `DiffusionFn`'s return to the concrete error union rather than `anyerror` so a kernel's real failure modes stay visible.

Keep `renderBayer` and the other single-effect `render*` wrappers exactly as they are: the 27 golden tests call them directly, and changing their signatures would churn every golden test file for no gain.

- [ ] **Step 4: Write planPasses**

Prepend to `src/pipeline/plan.zig`:

```zig
//! Port of `dithrrd/src/engine/planPasses.ts`: filter the stack down to
//! its enabled nodes, in order, and turn each into the `execute.Step`
//! its kernel consumes. The web version also skipped nodes whose
//! `type` was missing from the registry — unrepresentable here, since
//! `EffectId` is an enum and every arm has a catalog entry.
//!
//! This is where a node's positional params become named kernel
//! arguments. That mapping is the one place the catalog's control ORDER
//! is load-bearing: `params[0]` is `controls[0]`. Reordering a
//! `controls` array in catalog.zig without updating the matching arm
//! here compiles fine and silently swaps two parameters, which is why
//! every arm names its control in a comment.

const std = @import("std");
const catalog = @import("../catalog.zig");
const stack_mod = @import("../stack.zig");
const execute = @import("execute.zig");
const palettes = @import("../color/palettes.zig");

/// `out` must have room for `s.len` steps; callers size it
/// `[stack.max_nodes]Step`. Returns the prefix actually written.
pub fn planPasses(s: *const stack_mod.Stack, out: []execute.Step) []execute.Step {
    var count: usize = 0;
    for (s.items()) |node| {
        if (!node.enabled) continue;
        out[count] = stepFor(node);
        count += 1;
    }
    return out[0..count];
}

fn stepFor(node: stack_mod.Node) execute.Step {
    const p = node.params;
    return switch (node.effect) {
        // controls: brightness, contrast, gamma, saturation
        .grade => .{ .grade = .{
            .brightness = p[0].number,
            .contrast = p[1].number,
            .gamma = p[2].number,
            .saturation = p[3].number,
        } },
        // controls: pixelSize, levels, sampling (select), dither.
        // `sampling`/`dither` are floats in the Metal ABI (0 or 1) —
        // see PixelateParams' field comments.
        .pixelate => .{ .pixelate = .{
            .pixel_size = p[0].number,
            .levels = p[1].number,
            .sampling = @floatFromInt(p[2].choice),
            .dither = if (p[3].flag) 1 else 0,
        } },
        // controls: matrix (select), levels. `uniforms: p.matrix ===
        // '8' ? 8 : 4` — option index 1 is the 8x8 table, and
        // BayerParams.matrix is the pre-resolved 4.0/8.0 the kernel
        // reads directly.
        .bayer => .{ .bayer = .{
            .levels = @floatFromInt(levelsOf(p[1])),
            .matrix = if (p[0].choice == 1) 8.0 else 4.0,
        } },
        // controls: cellSize, angle. HalftoneParams.angle is RADIANS —
        // this is the web app's `uAngle: p.angle * Math.PI / 180`.
        .halftone => .{ .halftone = .{ .cell_size = p[0].number, .angle = radians(p[1]) } },
        .line_screen => .{ .line_screen = .{ .cell_size = p[0].number, .angle = radians(p[1]) } },
        .crosshatch => .{ .crosshatch = .{ .cell_size = p[0].number, .angle = radians(p[1]) } },
        // controls: levels
        .clustered_dot => .{ .clustered_dot = .{ .levels = @floatFromInt(levelsOf(p[0])) } },
        // controls: paletteId — resolved to real colours here, the same
        // way the web app's `uniforms(p, ctx)` looked the palette up in
        // `ctx.palettes` and called `paletteVec3Uniforms`. Plan 2
        // replaces `paletteAt` with a lookup over the model's palette
        // table once custom palettes exist; this call site does not
        // change.
        .palette => .{ .palette = device.makePaletteParams(paletteAt(p[0].palette).colors) },
        .duotone => .{ .duotone = device.makePaletteParams(paletteAt(p[0].palette).colors) },
        // controls: levels, angle, scale
        .per_channel => .{ .per_channel = .{
            .levels = @floatFromInt(levelsOf(p[0])),
            .angle = radians(p[1]),
            .scale = p[2].number,
        } },
        // controls: levels, serpentine — shared by all six
        .floyd => .{ .floyd = diffusionParams(p) },
        .atkinson => .{ .atkinson = diffusionParams(p) },
        .jarvis => .{ .jarvis = diffusionParams(p) },
        .stucki => .{ .stucki = diffusionParams(p) },
        .sierra => .{ .sierra = diffusionParams(p) },
        .burkes => .{ .burkes = diffusionParams(p) },
    };
}

fn diffusionParams(p: [catalog.max_controls]catalog.ParamValue) execute.DiffusionStepParams {
    return .{ .levels = levelsOf(p[0]), .serpentine = p[1].flag };
}

/// Degrees (what the catalog stores and the UI shows) to radians (what
/// every angle-taking kernel's param struct declares).
fn radians(value: catalog.ParamValue) f32 {
    return @floatCast(@as(f64, value.number) * std.math.pi / 180.0);
}

/// A `levels` control is a slider, so it arrives as an f32 whose value
/// is always integral (step 1). `@intFromFloat` truncates, so round
/// first — a slider reporting 3.9999996 must quantize to 4, not 3.
fn levelsOf(value: catalog.ParamValue) u32 {
    return @intFromFloat(@round(value.number));
}

/// The built-in palette table, indexed positionally. Plan 2 replaces
/// this with the model's own palette store; keeping the indirection
/// here means only this function changes then.
const builtin_palettes = [_]palettes.Palette{ palettes.bw, palettes.gray4, palettes.gameboy };

fn paletteAt(index: u8) palettes.Palette {
    // An out-of-range index is reachable if a stack outlives a palette
    // (plan 2's delete), so clamp rather than assert — the web app's
    // `ctx.palettes[id] ?? PALETTES.bw` had the same fallback.
    if (index >= builtin_palettes.len) return palettes.bw;
    return builtin_palettes[index];
}
```

`plan.zig` needs `const device = @import("device.zig");` for `makePaletteParams` (or re-export it through `execute.zig`, which already re-exports it at line 34 — prefer that and drop the extra import).

- [ ] **Step 5: Verify the goldens still pass**

Run: `native test`
Expected: PASS. All 27 golden comparisons still green, plus 5 new plan tests. If any golden turned red, the widening broke a kernel call — fix it there, never by touching `fixtures/`.

- [ ] **Step 6: Add a multi-effect chain test**

The goldens each exercise one effect. Add one test to `src/pipeline/plan.zig` proving a planned multi-step chain actually runs end to end and that a disabled node changes the output:

```zig
test "a planned three-effect chain renders, and disabling a node changes the result" {
    const test_image = @import("../testing/test_image.zig");
    const allocator = std.testing.allocator;

    var s: stack_mod.Stack = .{};
    _ = s.add(.grade).?;
    const bayer_id = s.add(.bayer).?;
    _ = s.add(.atkinson).?;

    const src = try test_image.generate(allocator, 64, 64);
    defer allocator.free(src);

    const gpu = try execute.Device.init();
    var pool = try execute.TexturePool.init(gpu, 64, 64);
    var buf: [stack_mod.max_nodes]execute.Step = undefined;

    const with_bayer = try execute.renderChain(allocator, gpu, &pool, src, 64, 64, planPasses(&s, &buf));
    defer allocator.free(with_bayer);

    s.toggle(bayer_id);
    const without_bayer = try execute.renderChain(allocator, gpu, &pool, src, 64, 64, planPasses(&s, &buf));
    defer allocator.free(without_bayer);

    try std.testing.expect(!std.mem.eql(u8, with_bayer, without_bayer));
}
```

Match `test_image.generate`'s real signature and `TexturePool`'s real init/deinit contract by reading `src/testing/test_image.zig` and `src/pipeline/device.zig`; if a Metal device is unavailable in the test environment, follow whatever guard the existing golden tests already use rather than inventing a new one.

- [ ] **Step 7: Run and commit**

Run: `native test`
Expected: PASS.

```bash
git add src/pipeline/plan.zig src/pipeline/execute.zig
git commit -m "feat: plan a stack into pipeline steps; widen Step to all 16 effects"
```

---

### Task 4: Resolve the slider contract, then lay out the three-pane shell

**Files:**
- Modify: `src/app.native`, `src/main.zig`
- Create: `docs/controls.md`
- Reference: the SDK's `skill-data/native-ui/SKILL.md`, sections "Elements", "Attributes", "Splitters", "Messages"

**Interfaces:**
- Consumes: `Model.preview_surface`, `Model.status`.
- Produces: `Model.split_left: f32`, `Model.split_right: f32`, Msg arms `resize_left: f32`, `resize_right: f32`; the three-pane markup skeleton later tasks fill in.

**This task opens with a contract question that must be answered empirically before any control markup is designed.**

The SDK docs state (`SKILL.md`, the `slider` row of the Elements table): *"a markup slider's `on-change` dispatches a PLAIN Msg with no value payload — mirror the applied value into the model with `Options.sync`"*. But `src/app.native`'s existing slider binds `on-change="set_levels"` against `set_levels: f32` and `main.zig` documents that the applied 0..1 fraction arrives as the payload. Both cannot be true. Which one holds decides how every control in Task 6 is wired.

- [ ] **Step 1: Determine what the slider actually dispatches**

Add a temporary `std.debug.print` in `update`'s `set_levels` arm printing the received fraction. Build and run:

```bash
native dev
```

Drag the slider from end to end and read stderr. Record which of these is true:

- **(A)** The printed values track the slider position across 0..1 → the payload contract holds; the docs are stale for this case.
- **(B)** The printed value is constant (0, or garbage) → the docs are right; a value needs `Options.sync`.

Then test the other half of the question, which matters just as much: change the binding to `on-change="set_levels:{some_int_field}"` against an integer Msg arm and confirm whether an **explicit payload** binding is accepted on a slider at all.

- [ ] **Step 2: Write down the answer**

Create `docs/controls.md` recording, with the evidence:

- what a markup slider's `on-change` delivers (bare tag, and with an explicit payload binding),
- whether `Options.sync` is needed,
- and the consequence: whether Task 6's controls panel can use `<for>` over a control list carrying the slot index as a payload, or must use fixed numbered slots.

**Default to fixed numbered slots** (`set_param_0..3`) unless (B) plus a working explicit-payload binding proves the `<for>` form. Fixed slots work under either contract; the `<for>` form works under only one.

Remove the temporary print.

- [ ] **Step 3: Add the split fractions to the model**

In `src/main.zig`:

```zig
    /// Split-pane fractions. The SDK's `split` is MODEL-owned: the
    /// runtime applies each drag as an optimistic echo and dispatches
    /// `on-resize` with the applied fraction, which the model must echo
    /// back through `value` or the next rebuild snaps the panes back.
    /// Defaults mirror the web app's `AppShell.tsx` — 20% stack, 56%
    /// viewport, 24% controls — expressed as two nested splits: the
    /// outer puts the stack at 0.20, the inner splits the remaining 80%
    /// so the viewport gets 56/80 = 0.70 of it.
    split_left: f32 = 0.20,
    split_right: f32 = 0.70,
```

and the Msg arms:

```zig
    resize_left: f32,
    resize_right: f32,
```

with `update` arms that store the applied fraction and nothing else:

```zig
        .resize_left => |fraction| model.split_left = fraction,
        .resize_right => |fraction| model.split_right = fraction,
```

- [ ] **Step 4: Write the shell markup**

Replace `src/app.native` with the three-pane skeleton. The stack and controls panes are placeholders that Tasks 5 and 6 fill; the toolbar's buttons beyond Reset land in plan 3.

```html
<!-- The three-pane editor shell, mirroring the web app's AppShell.tsx:
     a toolbar strip above a stack | viewport | controls row. The SDK's
     `split` takes exactly two children, so three panes are two nested
     splits, and each fraction is MODEL-owned — `on-resize` reports the
     applied value and `value` echoes it back, or the next rebuild
     snaps the divider home. See main.zig's split_left/split_right. -->
<column grow="1">
  <row padding="8" gap="8" cross="center">
    <text grow="1">dithrrd</text>
    <button size="sm" on-press="reset_stack">Reset</button>
  </row>
  <separator/>
  <split value="{split_left}" on-resize="resize_left" grow="1">
    <column min-width="180" padding="8" gap="6">
      <text foreground="text_muted">Stack</text>
    </column>
    <split value="{split_right}" on-resize="resize_right">
      <column padding="8" gap="8" grow="1">
        <media-surface surface="{preview_surface}" grow="1" label="Image preview" />
        <text foreground="text_muted">{status}</text>
      </column>
      <column min-width="200" padding="8" gap="6">
        <text foreground="text_muted">Controls</text>
      </column>
    </split>
  </split>
</column>
```

Add a `reset_stack` Msg arm that clears the stack (`model.stack.clear()`) once Task 5 has put a `stack` field on the model; until then, make it a no-op with a comment naming the task that fills it in.

- [ ] **Step 5: Validate and run**

Run: `native check` — expected: clean, no binding or validation errors.
Run: `native dev` — expected: three panes, both dividers draggable, the preview still rendering in the centre pane, and the pane sizes surviving a hot reload of `app.native`.

- [ ] **Step 6: Commit**

```bash
git add src/app.native src/main.zig docs/controls.md
git commit -m "feat: three-pane editor shell with model-owned split fractions"
```

---

### Task 5: The stack panel

**Files:**
- Modify: `src/app.native`, `src/main.zig`
- Reference (read-only, other repo): `dithrrd/src/ui/StackPanel.tsx`

**Interfaces:**
- Consumes: `stack.Stack`, `catalog`.
- Produces: `Model.stack: stack.Stack`; Msg arms `select_node: u32`, `toggle_node: u32`, `move_node_up: u32`, `move_node_down: u32`, `remove_node: u32`, `duplicate_node: u32`, `reset_stack`.

Reorder is **▲/▼ buttons plus a right-click context menu** — the SDK's markup grammar has no drag handler (the handler set is `on-press`, `on-toggle`, `on-change`, `on-submit`, `on-dismiss`, `on-hold`, `on-hover-*`, `on-input`, `on-scroll`, `on-reach-end`), so `sortable.ts`'s dnd-kit gesture has no port. The index math survives in `stack.move`; only the gesture changed.

- [ ] **Step 1: Write the failing test**

Add to `src/main.zig`'s test block — these test `update`, which is a plain function and needs no window:

```zig
test "update: selecting, toggling, and reordering stack nodes" {
    var model: Model = .{};
    var fx: Effects = undefined;
    const a = model.stack.add(.grade).?;
    const b = model.stack.add(.bayer).?;

    update(&model, .{ .select_node = a }, &fx);
    try std.testing.expectEqual(a, model.stack.selected.?);

    update(&model, .{ .toggle_node = a }, &fx);
    try std.testing.expectEqual(false, model.stack.items()[0].enabled);

    update(&model, .{ .move_node_down = a }, &fx);
    try std.testing.expectEqual(b, model.stack.items()[0].id);
    try std.testing.expectEqual(a, model.stack.items()[1].id);

    update(&model, .{ .remove_node = b }, &fx);
    try std.testing.expectEqual(@as(usize, 1), model.stack.len);
}

test "update: reset_stack empties the stack and clears the selection" {
    var model: Model = .{};
    var fx: Effects = undefined;
    _ = model.stack.add(.grade).?;
    _ = model.stack.add(.bayer).?;
    update(&model, .reset_stack, &fx);
    try std.testing.expectEqual(@as(usize, 0), model.stack.len);
    try std.testing.expectEqual(@as(?u32, null), model.stack.selected);
}
```

If passing an uninitialised `*Effects` is unsound in this SDK version, construct a real one the way the SDK's own `ui_app_tests.zig` does and use that instead — read it rather than guessing.

- [ ] **Step 2: Run to verify it fails**

Run: `native test`
Expected: compile error — `Model` has no `stack` field, `Msg` has no `select_node` arm.

- [ ] **Step 3: Extend Model and Msg, and add the update arms**

Add `stack: stack_mod.Stack = .{}` to `Model`, the six Msg arms above plus `reset_stack`, and the matching `update` arms — each is a one-line delegation to the `stack.Stack` method, since Task 2 already tested the semantics:

```zig
        .select_node => |id| model.stack.select(id),
        .toggle_node => |id| model.stack.toggle(id),
        .move_node_up => |id| model.stack.move(id, -1),
        .move_node_down => |id| model.stack.move(id, 1),
        .remove_node => |id| model.stack.remove(id),
        .duplicate_node => |id| _ = model.stack.duplicate(id),
        .reset_stack => model.stack.clear(),
```

Each of these changes the render result, so each must also request a re-render. Task 7 introduces `requestStackRender`; until then, add a `// Task 7: request a re-render here` comment on the group rather than leaving the omission silent.

Add a model helper the markup's `<for>` binds to:

```zig
    /// Bound by markup as `<for each="stackRows" key="id" as="n">`.
    /// Markup iterates a model field or a public single-model method;
    /// this exposes the stack's live prefix without letting the view
    /// see the unused tail of the fixed-capacity array.
    pub fn stackRows(self: *const Model) []const stack_mod.Node {
        return self.stack.items();
    }

    /// `<if test="{hasStack}">` — an explicit predicate rather than
    /// numeric truthiness on a count, per the SDK's markup guidance.
    pub fn hasStack(self: *const Model) bool {
        return self.stack.len > 0;
    }
```

`stack.Node` already exposes `pub fn name()`. Add one more for the row's selected state, since markup compares against the model's selection:

```zig
    /// `selected="{n.id == ...}"` cannot reach an optional, so the row
    /// asks the node itself. Set by `Model.stackRows`' caller? No — a
    /// Node does not know the selection, so the comparison lives in
    /// markup against a plain u32: `Model.selectedId` returns 0 for "no
    /// selection", which is never a real id (ids start at 1).
```

Add to `Model`:

```zig
    /// 0 means "nothing selected" — `stack.Stack.next_id` starts at 1,
    /// so 0 is never a real node id. Markup cannot compare against an
    /// optional, so the sentinel is the binding-friendly shape.
    pub fn selectedId(self: *const Model) u32 {
        return self.stack.selected orelse 0;
    }
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `native test`
Expected: PASS.

- [ ] **Step 5: Write the stack panel markup**

Replace the stack pane placeholder in `src/app.native`:

```html
    <column min-width="180" gap="6">
      <text padding="8" foreground="text_muted">Stack</text>
      <scroll grow="1">
        <column gap="2" padding="4">
          <for each="stackRows" key="id" as="n">
            <row gap="4" padding="4" cross="center" on-press="select_node:{n.id}"
                 selected="{n.id == selectedId}" label="{n.name}">
              <checkbox checked="{n.enabled}" on-toggle="toggle_node:{n.id}" label="Enabled"/>
              <text grow="1">{n.name}</text>
              <button size="sm" variant="ghost" icon="arrow-up" on-press="move_node_up:{n.id}" label="Move up"/>
              <button size="sm" variant="ghost" icon="arrow-down" on-press="move_node_down:{n.id}" label="Move down"/>
              <button size="sm" variant="ghost" icon="x" on-press="remove_node:{n.id}" label="Remove"/>
              <context-menu>
                <menu-item on-press="duplicate_node:{n.id}">Duplicate</menu-item>
                <menu-item on-press="toggle_node:{n.id}">Toggle</menu-item>
                <separator/>
                <menu-item on-press="remove_node:{n.id}">Delete</menu-item>
              </context-menu>
            </row>
          </for>
          <else>
            <text padding="8" foreground="text_muted">No effects yet</text>
          </else>
        </column>
      </scroll>
    </column>
```

Note the SDK's "one size register per row" rule: every control in the row carries `size="sm"` so the row reads as one height. The `<else>` directly after `</for>` is the empty state.

- [ ] **Step 6: Validate and verify through automation**

Run: `native check` — expected: clean.

Then verify the panel really behaves, using the automation harness rather than eyeballing (`native automate` snapshots the semantic tree — surface geometry and labels — which is exactly what this task changes):

```bash
native automate snapshot
```

Confirm: rows appear in stack order with their catalog display names, the selected row reports `selected`, each row's `context_menu=["Duplicate","Toggle","Delete"]` is listed, and clicking a ▲ button reorders the rows in the next snapshot while every row's widget id stays constant (stable ids across a reorder is the proof that `key="id"` gave the rows real identity).

- [ ] **Step 7: Commit**

```bash
git add src/app.native src/main.zig
git commit -m "feat: stack panel with selection, toggle, reorder, and context menu"
```

---

### Task 6: The controls panel

**Files:**
- Modify: `src/app.native`, `src/main.zig`
- Create: `src/ui_slots.zig`
- Reference (read-only, other repo): `dithrrd/src/ui/Control.tsx`, `dithrrd/src/ui/ControlsPanel.tsx`

**Interfaces:**
- Consumes: `catalog`, `stack.Stack`, `docs/controls.md`'s recorded slider contract.
- Produces: `ui_slots.Slot`, `ui_slots.slotsFor(node) [catalog.max_controls]Slot`; Msg arms `set_param_0..3: f32`, `toggle_param_0..3`, `pick_choice_0..3: u8`, `open_choice: u8`, `close_choice`; `Model.slot0..slot3` bindings.

The panel shows the **selected** effect's controls in **fixed numbered slots**. Slots are static because a markup payload binding carries exactly one scalar — a slider in a `<for>` cannot dispatch both *which control* and *the value*. With `max_controls = 4` that is four slots, and the model owns the slot→control mapping.

- [ ] **Step 1: Write the failing test**

Create `src/ui_slots.zig` with only these tests:

```zig
const std = @import("std");
const catalog = @import("catalog.zig");
const stack_mod = @import("stack.zig");

test "an unselected slot reports itself invisible" {
    const slots = slotsFor(null);
    for (slots) |slot| try std.testing.expectEqual(false, slot.visible);
}

test "grade fills all four slots with sliders carrying label, value, and fraction" {
    var s: stack_mod.Stack = .{};
    _ = s.add(.grade).?;
    const slots = slotsFor(s.selectedNode());
    for (slots) |slot| try std.testing.expectEqual(true, slot.visible);
    try std.testing.expectEqualStrings("Brightness", slots[0].label);
    try std.testing.expectEqual(catalog.ControlKind.slider, slots[0].kind);
    // brightness default 0 on a -0.5..0.5 range sits at the midpoint
    try std.testing.expectApproxEqAbs(@as(f32, 0.5), slots[0].fraction, 1e-6);
    // contrast default 1 on a 0..2 range also sits at the midpoint
    try std.testing.expectApproxEqAbs(@as(f32, 0.5), slots[1].fraction, 1e-6);
}

test "bayer fills two slots and leaves the rest invisible" {
    var s: stack_mod.Stack = .{};
    _ = s.add(.bayer).?;
    const slots = slotsFor(s.selectedNode());
    try std.testing.expectEqual(true, slots[0].visible);
    try std.testing.expectEqual(catalog.ControlKind.select, slots[0].kind);
    try std.testing.expectEqual(true, slots[1].visible);
    try std.testing.expectEqual(false, slots[2].visible);
    try std.testing.expectEqual(false, slots[3].visible);
}

test "an angle slot reports its 0..360 fraction and degree readout" {
    var s: stack_mod.Stack = .{};
    _ = s.add(.halftone).?;
    const slots = slotsFor(s.selectedNode());
    try std.testing.expectEqual(catalog.ControlKind.angle, slots[1].kind);
    try std.testing.expectApproxEqAbs(@as(f32, 45.0 / 360.0), slots[1].fraction, 1e-6);
}

test "a toggle slot reports its flag" {
    var s: stack_mod.Stack = .{};
    _ = s.add(.atkinson).?;
    const slots = slotsFor(s.selectedNode());
    try std.testing.expectEqual(catalog.ControlKind.toggle, slots[1].kind);
    try std.testing.expectEqual(true, slots[1].flag);
}

test "a palette slot borrows the built-in palette list for its options" {
    var s: stack_mod.Stack = .{};
    _ = s.add(.duotone).?;
    const slots = slotsFor(s.selectedNode());
    try std.testing.expectEqual(catalog.ControlKind.palette, slots[0].kind);
    try std.testing.expectEqual(@as(usize, 3), slots[0].options.len);
    // default is gameboy, index 2
    try std.testing.expectEqual(@as(u8, 2), slots[0].choice);
    try std.testing.expectEqualStrings("Game Boy", slots[0].choiceLabel());
}

test "valueFromFraction round-trips a slider fraction through the control's range and step" {
    const control = catalog.def(.grade).controls[2]; // gamma: 0.2..3 step 0.01
    try std.testing.expectApproxEqAbs(@as(f32, 0.2), valueFromFraction(control, 0), 1e-6);
    try std.testing.expectApproxEqAbs(@as(f32, 3.0), valueFromFraction(control, 1), 1e-6);
    // step quantization: the midpoint lands on a multiple of 0.01
    const mid = valueFromFraction(control, 0.5);
    try std.testing.expectApproxEqAbs(mid, @round(mid * 100) / 100, 1e-6);
}

test "levels sliders quantize to whole numbers at every fraction" {
    const control = catalog.def(.bayer).controls[1]; // levels: 2..8 step 1
    for (0..21) |i| {
        const fraction: f32 = @as(f32, @floatFromInt(i)) / 20.0;
        const value = valueFromFraction(control, fraction);
        try std.testing.expectEqual(value, @round(value));
        try std.testing.expect(value >= 2 and value <= 8);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `native test`
Expected: compile error — `slotsFor`, `valueFromFraction`, `Slot` undefined.

- [ ] **Step 3: Write the slot projection**

Prepend to `src/ui_slots.zig`:

```zig
//! The controls panel's view model: the selected effect's controls
//! projected onto a FIXED number of numbered slots.
//!
//! Why fixed slots rather than a `<for>` over the control list: a
//! markup payload binding carries exactly one scalar
//! (`on-press="pick:{n.id}"`), so a slider inside a `<for>` can
//! dispatch either WHICH control it is or WHAT value it now has, never
//! both. Numbered slots move the "which" into the Msg tag
//! (`set_param_2`) and leave the payload free for the value. The slot
//! count is `catalog.max_controls` (4 — `grade` and `pixelate` both
//! declare four controls), and the markup lays out exactly that many,
//! each guarded by its own `visible` flag. See docs/controls.md for the
//! measured slider contract this rests on.
//!
//! Sliders speak in 0..1 fractions, never app-domain values (the SDK
//! slider contract). `fraction` is the projection out; `valueFromFraction`
//! is the projection back, and it also applies the control's `step` so
//! a "levels" slider can never land on 3.4.

const std = @import("std");
const catalog = @import("catalog.zig");
const stack_mod = @import("stack.zig");

pub const Slot = struct {
    visible: bool = false,
    kind: catalog.ControlKind = .slider,
    label: []const u8 = "",
    /// Slider/angle: position as a 0..1 fraction.
    fraction: f32 = 0,
    /// Toggle: the current flag.
    flag: bool = false,
    /// Select: the current option index.
    choice: u8 = 0,
    /// Select: the options to render in the anchored dropdown.
    options: []const catalog.Option = &.{},
    /// The app-domain value behind `fraction`, carried so `readout`
    /// does not have to reverse the projection.
    value: f32 = 0,

    /// `{slot0.readout}` — the number shown beside the label, matching
    /// `Control.tsx`, which prints `{Number(value)}` for a slider and
    /// `{Number(value)}°` for an angle. Takes the frame arena because
    /// markup item methods may allocate their returned string there.
    pub fn readout(self: *const Slot, arena: std.mem.Allocator) []const u8 {
        return switch (self.kind) {
            .angle => std.fmt.allocPrint(arena, "{d:.0}°", .{self.value}) catch "",
            .slider => std.fmt.allocPrint(arena, "{d}", .{self.value}) catch "",
            else => "",
        };
    }

    /// Select: the current option's label, for the `select` trigger.
    pub fn choiceLabel(self: *const Slot) []const u8 {
        if (self.choice >= self.options.len) return "";
        return self.options[self.choice].label;
    }

    /// Markup's `<if test>` takes an explicit boolean predicate rather
    /// than an equality expression against an enum, so each control
    /// kind the panel renders differently gets its own predicate.
    pub fn isNumeric(self: *const Slot) bool {
        return self.kind == .slider or self.kind == .angle;
    }
    pub fn isToggle(self: *const Slot) bool {
        return self.kind == .toggle;
    }
    /// `palette` renders as a select over the built-in palettes in this
    /// plan; plan 2 gives it its own control and this predicate narrows
    /// to `.select` alone.
    pub fn isChoice(self: *const Slot) bool {
        return self.kind == .select or self.kind == .palette;
    }
};

/// A `palette` control declares no options in the catalog — the web
/// app's list was dynamic, drawn from the store's palette table. In
/// this plan that table is the three built-ins, so the panel renders a
/// palette control as an ordinary select over them. Plan 2 replaces
/// this constant with the model's live palette list and gives the
/// control its own swatch UI; the indices stay positional either way,
/// matching `plan.zig`'s `paletteAt`.
pub const palette_options: []const catalog.Option = &.{
    .{ .label = "Black & White", .value = "bw", .index = 0 },
    .{ .label = "Gray 4", .value = "gray4", .index = 1 },
    .{ .label = "Game Boy", .value = "gameboy", .index = 2 },
};

pub fn slotsFor(node: ?*const stack_mod.Node) [catalog.max_controls]Slot {
    var out: [catalog.max_controls]Slot = @splat(Slot{});
    const n = node orelse return out;
    for (catalog.def(n.effect).controls, 0..) |control, i| {
        out[i] = .{
            .visible = true,
            .kind = control.kind,
            .label = control.label,
            .options = if (control.kind == .palette) palette_options else control.options,
            .fraction = fractionOf(control, n.params[i]),
            .flag = switch (n.params[i]) {
                .flag => |f| f,
                else => false,
            },
            .choice = switch (n.params[i]) {
                .choice => |c| c,
                .palette => |p| p,
                else => 0,
            },
            .value = switch (n.params[i]) {
                .number => |v| v,
                else => 0,
            },
        };
    }
    return out;
}

fn rangeOf(control: catalog.Control) struct { min: f32, max: f32 } {
    // An angle control is always 0..360 (Control.tsx hardcodes that
    // range rather than reading min/max), so the catalog does not carry
    // one for it.
    return if (control.kind == .angle) .{ .min = 0, .max = 360 } else .{ .min = control.min, .max = control.max };
}

fn fractionOf(control: catalog.Control, value: catalog.ParamValue) f32 {
    const number = switch (value) {
        .number => |v| v,
        else => return 0,
    };
    const range = rangeOf(control);
    if (range.max == range.min) return 0;
    return std.math.clamp((number - range.min) / (range.max - range.min), 0, 1);
}

/// The inverse of `fractionOf`, plus step quantization. `step` is 1 for
/// every integer control (levels, cell size, pixel size) and 0.01 for
/// grade's four, so this is what keeps a "levels" slider from ever
/// producing 3.4 — the pipeline's `levelsOf` rounds too, but a
/// non-integral readout in the UI would still be wrong.
pub fn valueFromFraction(control: catalog.Control, fraction: f32) f32 {
    const range = rangeOf(control);
    const step: f32 = if (control.kind == .angle) 1 else control.step;
    const raw = range.min + std.math.clamp(fraction, 0, 1) * (range.max - range.min);
    if (step <= 0) return raw;
    const snapped = range.min + @round((raw - range.min) / step) * step;
    return std.math.clamp(snapped, range.min, range.max);
}
```

- [ ] **Step 4: Wire the slots into Model and Msg**

Add to `Model` four binding methods and the dropdown-open state:

```zig
    /// Which select-control dropdown is open, by slot index; null =
    /// none. Anchored surfaces are model-owned in this SDK (the `if`
    /// renders them, `on-dismiss` closes them), and at most one is open
    /// at a time — the panel shows one effect's controls.
    open_choice_slot: ?u8 = null,

    pub fn slot0(self: *const Model) ui_slots.Slot { return ui_slots.slotsFor(self.stack.selectedNode())[0]; }
    pub fn slot1(self: *const Model) ui_slots.Slot { return ui_slots.slotsFor(self.stack.selectedNode())[1]; }
    pub fn slot2(self: *const Model) ui_slots.Slot { return ui_slots.slotsFor(self.stack.selectedNode())[2]; }
    pub fn slot3(self: *const Model) ui_slots.Slot { return ui_slots.slotsFor(self.stack.selectedNode())[3]; }

    /// The panel's header — the selected effect's display name, or a
    /// prompt when nothing is selected.
    pub fn selectedName(self: *const Model) []const u8 {
        const node = self.stack.selectedNode() orelse return "Select an effect";
        return node.name();
    }
```

Add the Msg arms (`set_param_0..3: f32`, `toggle_param_0..3`, `pick_choice_0..3: u8`, `open_choice: u8`, `close_choice`) and one shared `update` helper so the four copies of each arm stay one line:

```zig
/// Slot N's slider moved. `fraction` is the slider's raw 0..1 value;
/// the slot's control supplies the range and step. Silently ignores a
/// dispatch for a slot the selected effect does not use — see
/// `stack.setParam`'s doc comment for why that is reachable rather than
/// a bug.
fn setSlotNumber(model: *Model, slot: u8, fraction: f32) void {
    const node = model.stack.selectedNode() orelse return;
    const controls = catalog.def(node.effect).controls;
    if (slot >= controls.len) return;
    const value = ui_slots.valueFromFraction(controls[slot], fraction);
    model.stack.setParam(node.id, slot, .{ .number = value });
}
```

with matching `toggleSlotFlag` and `setSlotChoice` helpers. Each arm calls its helper and then requests a re-render (Task 7).

If `docs/controls.md` recorded contract **(B)** — the slider carries no payload — replace the `f32` payload on `set_param_N` with `Options.sync` mirroring per that document, and adjust these helpers to read the mirrored value. Do not proceed on an assumption; the document is the authority.

- [ ] **Step 5: Write the controls panel markup**

Replace the controls pane placeholder. One block per slot; slots 1-3 are the same shape with the index changed.

```html
      <column min-width="200" gap="8">
        <text padding="8">{selectedName}</text>
        <scroll grow="1">
          <column gap="12" padding="8">

            <if test="{slot0.visible}">
              <column gap="6">
                <row cross="center">
                  <text grow="1" foreground="text_muted">{slot0.label}</text>
                  <text foreground="text_muted">{slot0.readout}</text>
                </row>
                <if test="{slot0.isNumeric}">
                  <slider value="{slot0.fraction}" on-change="set_param_0" label="{slot0.label}"/>
                </if>
                <if test="{slot0.isToggle}">
                  <checkbox checked="{slot0.flag}" on-toggle="toggle_param_0" text="{slot0.label}"/>
                </if>
                <if test="{slot0.isChoice}">
                  <stack>
                    <select text="{slot0.choiceLabel}" on-press="open_choice:0" label="{slot0.label}"/>
                    <if test="{choice0Open}">
                      <dropdown-menu anchor="below" anchor-alignment="stretch" on-dismiss="close_choice">
                        <for each="slot0.options" as="o">
                          <menu-item on-press="pick_choice_0:{o.index}">{o.label}</menu-item>
                        </for>
                      </dropdown-menu>
                    </if>
                  </stack>
                </if>
              </column>
            </if>

          </column>
        </scroll>
      </column>
```

Then repeat that entire `<if test="{slotN.visible}">` block three more times, for slots 1, 2 and 3. The substitution is purely mechanical and every occurrence changes — there are exactly six per block:

| in slot 0's block | becomes, in slot N's block |
|---|---|
| `{slot0.visible}` | `{slotN.visible}` |
| `{slot0.label}`, `{slot0.readout}`, `{slot0.fraction}`, `{slot0.flag}`, `{slot0.choiceLabel}`, `{slot0.options}`, `{slot0.isNumeric}`, `{slot0.isToggle}`, `{slot0.isChoice}` | `{slotN....}` |
| `on-change="set_param_0"` | `on-change="set_param_N"` |
| `on-toggle="toggle_param_0"` | `on-toggle="toggle_param_N"` |
| `on-press="open_choice:0"` | `on-press="open_choice:N"` |
| `{choice0Open}` | `{choiceNOpen}` |
| `on-press="pick_choice_0:{o.index}"` | `on-press="pick_choice_N:{o.index}"` |

Nothing else differs between the four blocks. Do not try to factor them with `<template>`/`<use>` in this task — the Msg tag differs per slot, and a template cannot parameterize a handler name.

Two supporting changes this markup needs:

- **`choice0Open`..`choice3Open` predicates on `Model`**, each `self.open_choice_slot == N`. The SDK's markup guidance prefers an explicit boolean method over an equality expression inside `test=`.
- **`ui_slots.palette_options` must carry `index` values** (0, 1, 2), like every other option literal. `catalog.Option` already declares the field and Task 1 already tests that catalog options are numbered correctly; extend that test to cover `palette_options` too.

`setSlotChoice` must write the arm the control expects — `.choice` for a `select`, `.palette` for a `palette` control:

```zig
fn setSlotChoice(model: *Model, slot: u8, index: u8) void {
    const node = model.stack.selectedNode() orelse return;
    const controls = catalog.def(node.effect).controls;
    if (slot >= controls.len) return;
    const value: catalog.ParamValue = switch (controls[slot].kind) {
        .palette => .{ .palette = index },
        else => .{ .choice = index },
    };
    model.stack.setParam(node.id, slot, value);
    model.open_choice_slot = null; // picking closes the menu
}
```

Mind the anchored-surface budget: 16 per view, and only one dropdown is ever open, so four `<if>`-guarded dropdowns are well inside it.

- [ ] **Step 6: Validate and verify**

Run: `native check` — expected: clean.
Run: `native test` — expected: PASS.
Run: `native automate snapshot` after selecting a `grade` node — expected: four labelled sliders with their readouts; after selecting `bayer`, a select trigger reading "4 × 4" plus one slider, and slots 2 and 3 absent from the tree entirely.

- [ ] **Step 7: Commit**

```bash
git add src/ui_slots.zig src/app.native src/main.zig
git commit -m "feat: controls panel with fixed slots for all four control kinds"
```

---

### Task 7: Add effects, and render the whole stack

**Files:**
- Modify: `src/main.zig`, `src/app.native`
- Reference: `main.zig`'s existing `requestRender`/`workerLoop`/`doRender`

**Interfaces:**
- Consumes: `plan.planPasses`, `execute.renderChain`, `stack.Stack`'s copy-by-value property.
- Produces: Msg arms `open_add_menu`, `close_add_menu`, `add_effect: catalog.EffectId`; `requestStackRender(*const Model)`; a generalized `workerLoop`.

This is the task that makes the app work. Two halves: an "Add effect" menu listing the catalog, and replacing the worker's `u32 levels` request channel with a whole-stack snapshot.

- [ ] **Step 1: Write the failing test**

Add to `src/main.zig`'s tests:

```zig
test "update: add_effect appends the chosen effect and closes the menu" {
    var model: Model = .{};
    var fx: Effects = undefined;
    update(&model, .open_add_menu, &fx);
    try std.testing.expectEqual(true, model.add_menu_open);
    update(&model, .{ .add_effect = .halftone }, &fx);
    try std.testing.expectEqual(@as(usize, 1), model.stack.len);
    try std.testing.expectEqual(catalog.EffectId.halftone, model.stack.items()[0].effect);
    try std.testing.expectEqual(false, model.add_menu_open);
    // adding selects the new node, matching store.ts's addNode
    try std.testing.expectEqual(model.stack.items()[0].id, model.stack.selected.?);
}

test "the render request channel carries the latest stack, not a backlog" {
    var model: Model = .{};
    _ = model.stack.add(.bayer).?;
    requestStackRender(&model);
    const first = g_render_generation.load(.acquire);
    _ = model.stack.add(.grade).?;
    requestStackRender(&model);
    const second = g_render_generation.load(.acquire);
    try std.testing.expect(second > first);
    // The pending snapshot is the LATEST stack, not the first — a
    // superseded request leaves no trace, exactly like pushFrame's
    // latest-wins contract at the frame layer.
    var snapshot: stack_mod.Stack = undefined;
    try std.testing.expectEqual(true, takeRenderRequest(&snapshot));
    try std.testing.expectEqual(@as(usize, 2), snapshot.len);
    try std.testing.expectEqual(false, takeRenderRequest(&snapshot));
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `native test`
Expected: compile error — `add_menu_open`, `requestStackRender`, `takeRenderRequest`, `g_render_generation` undefined.

- [ ] **Step 3: Replace the render request channel**

Delete `g_requested_levels` and `requestRender`. Replace with a mutex-guarded snapshot plus a generation counter:

```zig
/// The render request channel, generalized from Task 6's single
/// `u32 levels` atomic to a whole-stack snapshot.
///
/// Shape and why: `update` (loop thread) writes the latest stack under
/// a brief lock and bumps `g_render_generation`; the worker compares
/// generations, and when it sees a newer one copies the snapshot out
/// under the same lock and renders from its own copy. A `stack.Stack`
/// is POD and fixed-capacity (see stack.zig's module doc comment), so
/// the copy is a plain assignment with no allocation and no lifetime —
/// which is the entire reason the stack was designed that way.
///
/// The lock is held only for the two struct copies, never across a
/// render or a `pushFrame`, so `update` cannot stall behind a 40ms
/// chain — the property Task 6's fix round established and this must
/// not regress. Requests that arrive while a render is in flight
/// overwrite the pending snapshot rather than queuing: latest-wins on
/// the request side, mirroring what `pushFrame` already gives the push
/// side.
var g_render_mutex: std.Thread.Mutex = .{};
var g_render_pending: stack_mod.Stack = .{};
var g_render_generation = std.atomic.Value(u64).init(0);
var g_render_consumed: u64 = 0; // worker-thread-local bookkeeping

fn requestStackRender(model: *const Model) void {
    g_render_mutex.lock();
    g_render_pending = model.stack;
    g_render_mutex.unlock();
    _ = g_render_generation.fetchAdd(1, .release);
}

/// Worker side: copy out the pending snapshot if it is newer than the
/// last one taken. Returns false when there is nothing new, so the
/// worker sleeps instead of re-rendering an unchanged stack.
fn takeRenderRequest(out: *stack_mod.Stack) bool {
    const generation = g_render_generation.load(.acquire);
    if (generation == g_render_consumed) return false;
    g_render_mutex.lock();
    out.* = g_render_pending;
    g_render_mutex.unlock();
    g_render_consumed = generation;
    return true;
}
```

If `std.Thread.Mutex` is unavailable in this Zig 0.16 toolchain — `main.zig` already documents that `std.Thread`'s sleep moved under `std.Io.Clock`, so check rather than assume — use a seqlock over two buffers with an atomic index instead, and document the choice. Do **not** reach for `std.Io.Mutex`: it needs an `Io` bound to the calling thread's own event loop, which the render worker does not have.

- [ ] **Step 4: Generalize doRender and the worker loop**

`doRender` takes a `*const stack_mod.Stack` instead of `u32 levels`, plans it, and runs the chain:

```zig
fn doRender(s: *const stack_mod.Stack) ?f64 {
    if (g_gpu == null or g_pool == null or g_decoded == null or g_producer == null) return null;
    // ...
    var step_buf: [stack_mod.max_nodes]execute.Step = undefined;
    const steps = plan.planPasses(s, &step_buf);
    // An empty stack is not an error and not a no-op: it means "show
    // the source image", which is exactly what renderChain with zero
    // steps produces (upload, then download).
    const chained = pipeline.renderChain(..., steps) catch { ... };
    // ...
}
```

`workerLoop` polls `takeRenderRequest` on the same 2ms interval:

```zig
fn workerLoop() void {
    var snapshot: stack_mod.Stack = undefined;
    while (true) {
        if (takeRenderRequest(&snapshot)) {
            _ = doRender(&snapshot);
        } else {
            workerSleepMs(2);
        }
    }
}
```

Then replace every `// Task 7: request a re-render here` comment from Tasks 5 and 6 with a real `requestStackRender(model)` call, and update `attachPreviewProducer`'s startup render to plan the initial stack. Delete `set_levels`, `levelsFromFraction`, `Model.levels`, and the now-unused `default_levels_fraction`/`min_quantize_levels`/`max_quantize_levels` constants — the per-effect `levels` sliders replace that single global control entirely. Keep `levelsFromFraction`'s test only if the function survives; if it does not, delete the test rather than leaving it asserting a deleted concept.

Seed the initial stack in `initialModel` with one `bayer` node so the app still shows a dithered image on first launch, matching the slice's behaviour.

- [ ] **Step 5: Add the "Add effect" menu**

`Model` gains `add_menu_open: bool = false` and a binding for the catalog list:

```zig
    /// `<for each="catalogRows" as="e">` — the full catalog in registry
    /// order. Static, but exposed as a model method because markup
    /// iterates model bindings, not module-level constants.
    pub fn catalogRows(self: *const Model) []const catalog.EffectDef {
        _ = self;
        return &catalog.all;
    }
```

Markup, in the stack pane above the list:

```html
      <stack>
        <button size="sm" on-press="open_add_menu">Add effect</button>
        <if test="{add_menu_open}">
          <dropdown-menu anchor="below" anchor-alignment="stretch" on-dismiss="close_add_menu">
            <for each="catalogRows" key="slug" as="e">
              <menu-item on-press="add_effect:{e.id}">{e.name}</menu-item>
            </for>
          </dropdown-menu>
        </if>
      </stack>
```

`add_effect: catalog.EffectId` relies on the SDK's documented enum payload coercion ("enums (from tag names)"). If `{e.id}` does not coerce from an enum field, bind `{e.slug}` against a `[]const u8` arm and resolve it through a `catalog.bySlug` lookup — add that function with its own test rather than doing string comparison in `update`.

- [ ] **Step 6: Verify end to end**

Run: `native test` — expected: PASS.
Run: `native check` — expected: clean.
Run: `native dev` and exercise the whole app:

- Add each of the 16 effects at least once; every one renders without a crash or a stderr error.
- Build a 4-effect chain mixing GPU and diffusion effects; confirm the preview reflects it.
- Drag a slider continuously and confirm the preview keeps up without the window stalling — this is the property Task 6's fix round established for the single slider and it must survive the generalization.
- Toggle a mid-stack node off and on; the preview changes both ways.
- Reorder a node with ▲/▼ and confirm the preview changes (a `grade` before vs. after a `bayer` is visibly different).
- Right-click a row and use Duplicate and Delete.
- Delete every node and confirm the preview shows the undithered source image rather than blanking.

Record the measured slider-drag latency at the preview ceiling (`DITHRRD_IMAGE=assets/large.jpg`) in `docs/seam.md`, next to the Task 6 numbers, so the whole-stack cost is on the record beside the single-effect cost.

- [ ] **Step 7: Commit**

```bash
git add src/main.zig src/app.native docs/seam.md
git commit -m "feat: add-effect menu and whole-stack rendering on the worker thread"
```

---

## Out of scope for this plan

Deferred to plans 2 and 3, and not to be built here:

- Palette **editing** and custom palettes. Palette-typed controls render as a select over the three built-ins (`bw`, `gray4`, `gameboy`) and are fully usable; only the editor defers.
- Disk persistence of anything.
- Native open dialog, drag-and-drop, PNG export, menu bar and keyboard shortcuts.
- Full-resolution rendering. The preview cap stays where it is.
- Zoom, pan, and before/after comparison in the viewport.

## Known risks

- **The slider payload contract (Task 4).** The SDK docs and the existing code disagree. Task 4 resolves it empirically before Task 6 depends on the answer, and fixed slots were chosen specifically because they work under either contract.
- **Struct-returning model bindings (Task 6).** `{slot0.label}` assumes markup can reach a field on a struct returned by a model method. The documented examples all bind fields on `<for>` *items*, not on a struct returned by a plain binding. `native check` answers this in seconds — write one `<text>{slot0.label}</text>` and run it before building all four blocks. If it is rejected, flatten `Slot` into per-field model methods (`slot0Label`, `slot0Fraction`, `slot0IsNumeric`, …) generated by a comptime loop over `0..max_controls`; `ui_slots.zig` and its tests are unaffected either way, since only the binding surface changes.
- **Angle conversion has no golden.** `plan.zig` converts degrees to radians, and the goldens call `renderHalftone` directly with radians already resolved — so a wrong conversion here passes every existing test. Task 3's `planPasses` test is the only guard; do not weaken it.
- **`std.Thread.Mutex` availability (Task 7).** Zig 0.16 moved several threading primitives under `std.Io`. The task names a concrete fallback.
- **Widening `Step` could disturb a golden.** The 27 golden comparisons are the gate on Task 3 and run on every `native test` after it, so a regression surfaces in the same task that could cause it.
- **Enum payload coercion in markup (Task 7).** Documented as supported; the task names a slug-based fallback if it is not.
