# Native vertical slice — outcome

Executed 2026-07-27/28. Repo: `~/workspace/dithrrd-native`, 10 commits, 31/31 tests green, CI green on hosted macOS runners.

**Result: the architecture works.** Both Metal kernels reproduce the web app's output byte-perfectly (`badFraction=0.000000`, `maxDelta=0`).

## What was proven

| Unknown | Answer |
|---|---|
| Can app code reach the SDK `Runtime` to acquire a media-surface producer? | Yes — `App.start_fn` (`api.zig:414`), a public field `UiApp.app()` leaves unset. Two lines. |
| Can Metal run from Zig without a Swift/ObjC shim? | Yes — raw `objc_msgSend` with a comptime helper on Zig 0.16's `@Fn`. Same technique carried to ImageIO. |
| Does the GPU→CPU→GPU readback hop work? | Yes. `bayer → atkinson` renders correctly. |
| Is synchronous rendering viable? | **No.** 46ms p50 at real preview size (2 MP). Now threaded: `update` stores the request atomically, a worker renders and pushes. |
| Do Metal kernels match the web goldens? | Yes, byte-perfect — after fixing a real bug the goldens caught. |

## The finding that justifies the whole harness

The Bayer kernel **looked correct**. Its output was a textbook crosshatch, and a reviewer verified both matrices entry-by-entry against the GLSL. It was still wrong: `badFraction=0.477`, `maxDelta=255` — roughly half the pixels inverted.

Cause: the web pipeline uploads with `flipY: true`, so the fragment shader's `y` is GL-bottom-up. The dither matrix row for visual row `r` is therefore `(height - 1 - r) % 4`, not `r % 4`. Only the golden comparison caught it. It is heavily commented in `kernels.metal`.

Two coordinate conventions separate the pipelines, and both are now derived and tested rather than guessed:
- **Ordered dithers** need the matrix row index mirrored.
- **Diffusion** must run bottom-up with inverted serpentine parity — `diffuse.zig` flips before and after, and matched on the first try.

## Blocking follow-ups for phase 2

1. **Only `levels=2` is golden-tested.** The slider spans 2–8 and nothing above 2 is verified against anything. Per-level rounding differences hide exactly in the quantize path. **Generate `levels=3` goldens in the web repo before porting more kernels**, or 14 kernels get built on a single verified point.

2. **"The remaining 14 kernels are mechanical" is overclaimed.** It holds for the two shapes the slice exercised — GPU pointwise and CPU diffusion. It does **not** obviously hold for `halftone`, `perChannel`, `lineScreen`, and `crosshatch`, which use rotated coordinates and `floor()` near cell boundaries. `fixtures/README.md` already flags `perChannel` as the least reproducible on the web side (unit pitch, ~1e-5 sin/cos difference flips ~470 pixels). Those will likely not be byte-perfect against Metal, and the `maxDelta <= 64` ceiling will need per-effect relaxation. Plan for it rather than discovering it at kernel #9.

3. **Colour-space risk in the comparison path.** `codec.zig` draws into a `CGColorSpaceCreateDeviceRGB` context. Lossless for these two goldens (`maxDelta=0` proves it), but if any of the other 16 golden PNGs carries a non-sRGB profile, ImageIO will convert and the comparison will drift for reasons unrelated to the kernel.

## Non-blocking

- 8×8 Bayer path is plumbed but unexercised — closes automatically once `grade` is ported and `stack-grade-bayer.png` becomes usable.
- Worker thread never joins; runs to process exit. Safe today via `pushFrame`'s `error.MediaSurfaceReleased` contract, verified by a kill-mid-render test. Revisit at multi-window.
- `Model.status` no longer reflects render completion for slider renders — no safe cross-thread path back into `Model` without a per-thread `Io`.
- `objc_msgSend` pattern needs `objc_msgSend_fpret` if any future call returns float/double on x86_64. Correct on arm64.
- Only EXIF orientation 6 exercised, via a hand-crafted tag.

## Gotchas worth knowing before touching this

- **`native automate screenshot` cannot verify media-surface content.** It renders the deterministic reference path, which always draws the id-derived placeholder. Use debug PNG dumps.
- **`gpu_sample` is a one-shot boot-time latch** (`appkit_host.m:5846-5882`), not a live readback. It proves first-frame liveness only and can never show a content change.
- **Zig has no test auto-discovery** and `zig test` does not analyse `main`, so a file reachable only from `main` compiles into the app while contributing zero tests — and the suite still reports success. `build.zig` now walks `src/` and generates an aggregate. See `docs/testing.md`.
- **`png.decodeRgba8` cannot parse Chromium-encoded multi-IDAT PNGs.** Use ImageIO for browser-produced files.
- Xcode's Metal Toolchain is a separate download; `-newLibraryWithData:` needs a real `dispatch_data_t`, not `NSData`, or Metal's loader segfaults.
- `native automate widget-drag <view> <id> 1.0 1.0` silently fails at exact max; 0.98 works.

## Loose end

A scratch GitHub repo `narrowstacks/dithrrd-native-ci-scratch` (private) was created during the final fix wave to prove the CI workflow goes green on a hosted macOS runner. The verification succeeded. The repo is disposable and should be deleted.

---

# Phase 2 complete — all 16 effects ported

Executed 2026-07-28. `dithrrd-native` head `009025c`, **60/60 tests, 27 golden comparisons, 23 byte-perfect.**

## Goldens extended first

The blocking follow-up was closed before any porting: the web harness gained a `levels: 3` variant for all 10 effects carrying a `levels` param, plus `bayer-matrix8` for the previously-unexercised 8×8 matrix. **29 fixtures, all byte-distinct**, browser suite 35 → 46 tests. On branch `test/golden-fixture-harness` (PR #1).

That decision paid for itself immediately — see the precision bug below.

## Results

| Group | Effects | Outcome |
|---|---|---|
| CPU diffusion | atkinson, floyd, jarvis, stucki, sierra, burkes | byte-perfect |
| GPU ordered / pointwise | bayer (4×4 and 8×8), grade, palette, duotone, pixelate, clusteredDot | byte-perfect |
| GPU rotated-coordinate | lineScreen | byte-perfect (maxDelta 2) |
| GPU rotated-coordinate | halftone, crosshatch, perChannel | relaxed, precision-limited |

## Three bugs the goldens caught that review did not

1. **f32 vs f64 diffusion precision.** `algorithms.ts` runs diffusion at JS double precision, truncating to f32 only at `Float32Array` storage points. The Zig port used f32 throughout — matching every kernel/image combination *except* `sierra-levels3` near a quantization boundary. Without the levels=3 goldens this would have shipped silently across all six diffusion kernels.
2. **`pixelate`'s offset sampling needs a second flip.** The cell maths lives in GL-bottom-up space, but pixelate samples `src` at an *offset* position rather than its own fragment position; that offset had to be re-flipped before hitting a top-down texture. Initially `badFraction=0.91`.
3. **The Bayer matrix row-mirror** (phase 1) — `(height-1-r)%4`, not `r%4`.

Together with phase 1, that is four coordinate/precision conventions separating the two pipelines, all now derived and tested rather than guessed.

## Why four effects are not byte-perfect — and why that is fine

An independent reviewer reimplemented all four in **pure Python float64, no GPU**, and reproduced the Metal port's mismatch counts to within ~13 pixels out of 65,536. The residual is inherent to the goldens, not the kernels.

The mechanism is **not** sub-ULP sin/cos differences, as first assumed. All 449 crosshatch bad pixels sit within 0.0024 of a `fract(u/6)` boundary — ~500× larger than f32 trig ULP. The real cause: the web pipeline is a **fragment shader**, so `vUv` is interpolated by the rasterizer in ~1/256px fixed-point quanta. A compute kernel indexing integer `gid` cannot reproduce that by construction.

A half-texel-offset bug was actively falsified: injecting ±0.5 texel of bias *triples* the mismatch, so zero bias is the minimum.

Final tolerances, per-effect and explicit (22 sites still use the strict default):

| effect | bad-fraction limit | max-delta ceiling | measured |
|---|---|---|---|
| perChannel-default | 0.035 | 255 | 0.0301 / 255 |
| perChannel-levels3 | 0.035 | 128 | 0.0293 / 128 |
| halftone-default | 0.05 | 96 | 0.0422 / 60 |
| crosshatch-default | 0.01 | 255 | 0.0069 / 255 |

`perChannel-levels3`'s ceiling was tightened from 255 to 128 (a one-level flip at 3 levels caps at 128, so 255 was 2× looser than its own justification). `halftone`'s was made explicit at 96 rather than incidentally clearing the default 64 by 4 — an equally valid f64 reference measures 71.

## What remains

The effect catalogue is complete and verified. Still unbuilt, all previously scoped out of the slice: the reorderable effect stack UI, palette editor with custom palettes, disk persistence, native open/save dialogs, drag-and-drop, menus, and full-resolution export. None of them test an unknown.
