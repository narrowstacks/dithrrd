# Native Stack UI — outcome record

Date: 2026-07-28
Plan: `2026-07-27-native-stack-ui.md` (plan 1 of 3)
Repo: `dithrrd-native`, branch `feat/stack-ui`, 17 commits off `master` @ `009025c`

## Result

The vertical-slice spike — one hardcoded `bayer → atkinson` chain driven by one
slider — is now a real editor: a reorderable stack of any of the 16 effects,
each with live controls, rendering on a worker thread.

| | before | after |
|---|---|---|
| Tests | 60 | 128 (Debug **and** ReleaseFast) |
| Golden comparisons | 27 | 27, byte-identical |
| `native check --strict` | clean | clean |

`fixtures/` and `src/testing/golden.zig` verified untouched **per commit** across
all 17 commits, not merely at the tip.

Latency at the preview ceiling (1672×1254) for `bayer → atkinson`: p50 53.2ms,
against 56.0ms for the pre-generalization binary rebuilt in a scratch worktree
and measured in the same session. The generalized path is comparable, not worse.
A 4-effect chain is p50 106ms.

## Three SDK defects found, all verified at source

These cost real time and are not in the SDK's docs. Recorded so plans 2 and 3
do not rediscover them.

**1. A markup slider's `on-change` DOES deliver the applied 0..1 fraction.**
The SDK's `native-ui/SKILL.md` states the opposite — that it dispatches a plain
Msg with no value and you must mirror via `Options.sync`. Source
(`primitives/canvas/ui_markup_compiled.zig`, `applyMessageAttr`) shows that a
bare tag against a float-typed Msg arm compiles to `options.on_value`, the same
auto-promotion the docs attribute only to the Zig builder's `Ui.valueMsg`. The
Elements-table entry is *incomplete*, not stale. Full evidence in the native
repo's `docs/controls.md`.

**2. A message payload must be a binding path, never a literal.**
`on-press="open_choice:0"` does not parse. `parseMessageExpression`
(`ui_markup.zig:814-826`) requires `{…}`, and `isBindingPath`
(`ui_markup_expr.zig:620-635`) then requires an identifier start byte, so `{0}`
fails too. Use distinct no-payload arms.

**3. `<select text="{...}"/>` renders visibly blank.**
`select` is `takes_text = true` (`ui_schema.zig:248`) with no `takes_children`,
so `ui_markup_view.zig:502-506` unconditionally overwrites `widget.text` from
interpolated child content — which is `""` for a self-closing node. **The SDK's
own SKILL.md example uses this broken form.** Put the value in child content.

A fourth, milder constraint: markup cannot bind a field on a struct returned by
a model *method*. The resolver recurses past a struct field but not past a
zero-arg method's return (`ui_markup_view.zig:2547-2561`). `{slot0.label}` is
unresolvable; the panel needs flattened per-slot accessors.

## The concurrency bug

`std.Thread.Mutex` does not exist in this Zig 0.16 toolchain, so the render
request channel is a hand-rolled seqlock over two `Stack` slots. The first
version was **unsound**:

```zig
out.* = g_render_slots[published & 1];                 // plain loads
if (g_render_generation.load(.acquire) == published)   // orders nothing before it
```

`.acquire` is a one-way barrier — it orders accesses *after* it and does nothing
for the memcpy's loads *before* it, so those loads may be satisfied after the
re-check has already seen an unchanged word. Disassembly showed `bl _memcpy`
followed directly by `ldapr`, no barrier between.

Two independent harnesses reproduced it: ~493 torn reads per 20M takes with the
real functions driven from inside `main.zig`, 0 per 20M with the fix. When it
fires, the result is a `Stack` word-spliced from two snapshots — `len` stays in
range, but a `Node` can pair `effect` from one with `params` from the other,
producing exactly the union-tag panic in `plan.stepFor` that a Task 6 fix round
had separately closed.

Fix: `fetchAdd(0, .acq_rel)` on both sides — neither `@fence` nor
`std.atomic.fence` exists in this toolchain — hoisted into a named
`fenceSeqlock()` helper so the sites read as intent rather than as dead
arithmetic. The realistic regression is someone simplifying `fetchAdd(0)` back
to a load because adding zero looks like a no-op.

**The stress test is deliberately not in the suite.** 4 of the reviewer's 14
runs showed zero tears *with the bug present*; as a merge gate that is a 30–70%
per-run chance of green-lighting a broken protocol, which converts "unverified"
into "verified" — strictly worse than no test. TSan is also out: a seqlock's
payload copy is an intentional data race, so it would flag the corrected code.
The guard is a deterministic source-text check on the fence call sites instead.

## The recurring failure mode: guards that assert nothing

Four separate times, a test that looked like a guard was vacuous. This is the
most transferable lesson from the run.

1. **Identity-transform fixture.** The multi-effect chain test used `grade` at
   its defaults — brightness 0, contrast 1, gamma 1, saturation 1 — which makes
   the kernel an identity transform. The test passed if the `.grade` arm
   dispatched the wrong kernel entirely.
2. **Defaults that collapse the distinction.** The degrees→radians test covered
   only `halftone`; `crosshatch` and `per_channel` default to 0°, where degrees
   and radians are indistinguishable. Deleting the conversion from three of four
   arms left the suite green.
3. **Fixture where distinct cases produce identical values.** The widget-tree
   test was reported as pinning all 40 per-slot accessors. Grade's four sliders
   sit at fractions 0.5, 0.5, 0.2857, 0.5 — so slots 0, 1 and 3 were mutually
   indistinguishable. It pinned 4, imperfectly. Honest count after the fix: 31.
4. **Self-matching needle.** A source-text guard `@embedFile`d `main.zig` and
   searched for `"fetchAdd(0, .acq_rel)"` — but the file it searches is the file
   the test lives in, so the needle matched its own source. Caught only by
   deleting each fence and watching the suite stay green three times.

And the same shape at branch scale: `catalog.Control.key` was written 24 times
and read **zero** times, so nothing checked that `plan.zig`'s positional
`params[i]` mapping still matched the catalog's control order. Coverage was
incidental — `line_screen`, `crosshatch` and `per_channel` were pinned by
nothing. Proven by mutation: swapping `line_screen`'s `cellSize`/`angle`, and
`per_channel`'s `levels`/`scale`, each left 126/126 passing while the kernels
silently received wrong arguments.

**The practice that caught all of these was mutation, not reading.** Every guard
added late in the run was verified by deliberately breaking the thing it guards
and confirming the failure. Reviews that only read code confirmed correctness
they could not actually establish.

## Design decisions worth keeping

- **Reorder is ▲/▼ buttons plus a context menu.** Markup has no drag handler at
  all, so `sortable.ts`'s gesture has no port; only the index math survives.
- **Fixed numbered `set_param_0..3` arms, not a `<for>` loop.** One `on-change`
  cannot carry both a slot identity and a live value under either binding form.
  This forces four near-identical markup blocks; `<template>`/`<use>` cannot
  parameterize a handler name, so the duplication is unfactorable while staying
  in markup. Human-adjudicated; it stands.
- **`Step` arms carry `device.zig`'s `extern` param structs directly**, which
  makes `plan.zig` the exact port of the web app's 16 `uniforms()` functions
  rather than a new translation layer.
- **`changesRender(msg)` as an exclusion switch with `else => true`**, rather
  than ~20 inline `requestStackRender` calls. A new Msg arm re-renders by
  default — a wasted render, never a silently dead control.
- **`Stack` is fixed-capacity POD with zero-initialized storage**, so the worker
  thread's snapshot is a plain struct assignment with no allocator and no
  lifetime.

## Known residuals (all judged ship-safe)

- 9 of 40 per-slot accessors have no rendered-tree guard — the combinations no
  catalog effect places at those indices.
- `plan.zig`'s `builtin_palettes` and `ui_slots.zig`'s `palette_options` are two
  expressions of the palette table, cross-checked by one test. Plan 2 replaces
  both with the model's live palette store.
- Render status never shows a completion time after startup: the worker cannot
  write `Model`, and this SDK offers no route back onto the loop thread.
- Nothing caps chain length against render cost; a 4-effect chain at the preview
  ceiling is ~106ms and `max_nodes` is 32.

## Next

Plan 2 (palette editor, custom palettes, persistence) and plan 3 (native open
dialog, drag-and-drop, PNG export, menu bar) are unwritten. Both `PlatformServices`
dialogs and `files_dropped` events were confirmed to exist during design; reaching
them from a Zig core needs a seam like the `start_fn` one, which is plan 3's first
task, not an assumption.
