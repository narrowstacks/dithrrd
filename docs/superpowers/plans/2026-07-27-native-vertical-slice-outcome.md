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
