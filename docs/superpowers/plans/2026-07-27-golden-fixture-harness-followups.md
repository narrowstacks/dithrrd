# Golden fixture harness — follow-ups

Deferred items from executing `2026-07-27-golden-fixture-harness.md`. None block merge; the final whole-branch review verdict was APPROVE WITH FOLLOW-UPS and all pre-merge items were fixed on the branch.

Ranked by value.

## 1. The bad-pixel gate tolerates 65 wrong pixels, not one

`MAX_DIFF_FRACTION = 0.001` on a 256×256 image is `0.001 × 65536 ≈ 65` pixels. Any 65 pixels may be arbitrarily wrong — full-magnitude garbage — and the golden still passes.

This was understated when the tolerance policy was chosen: the decision was framed as tolerating *a single* outlier pixel. 65 wrong pixels is a plausible real Metal kernel bug (one tile, one edge row, one wrap-around case).

Fix: add a companion ceiling so magnitude is bounded as well as count, e.g. fail when `maxDelta > 64` regardless of `badFraction`. Keeps the driver-noise tolerance that motivated the current gate while closing the loophole.

`src/testing/goldens.ts`

## 2. `perChannel` is the least reproducible golden

It applies `floor()` to a coordinate rotated 15°/75° at **unit pitch**, over coordinates reaching ~362px. A sin/cos difference of ~1e-5 between GPU vendors flips roughly 470 pixels — `badFraction ≈ 7e-3`, about 7× over the gate.

By comparison `halftone` uses cell pitch 8 and has ~800× more margin; `crosshatch` and `perChannel` default to `angle: 0`, so today's sin/cos is exact; `lineScreen` is smoothstep-continuous.

Consequence: regenerating on the same GPU vendor is fine, a different vendor likely needs regeneration or a per-effect tolerance. Fix: allow per-effect tolerance overrides in `assertGolden`.

`src/testing/goldens.ts`, `src/testing/effects.browser.test.ts`

## 3. `MAX_DIFF_FRACTION` is now a misnomer

After the Task 4 fix it gates `badFraction`, not `diffFraction`. `diffFraction` survives as a diagnostic and in the no-op guard. Rename to `MAX_BAD_FRACTION`.

`src/testing/goldens.ts`

## 4. `decodePng` uses default `createImageBitmap` options

Safe today because every golden is canvas-authored and fully opaque. It will bite when the native port emits PNGs from a different encoder, since colour-space conversion and alpha premultiplication would then apply silently.

Fix: pass `{ colorSpaceConversion: 'none', premultiplyAlpha: 'none' }`.

`src/testing/png.ts`

## 5. No CI job, deliberately

Linux runners use SwiftShader/Mesa and will not reproduce macOS ANGLE/Metal output, so wiring this in today produces a red suite rather than signal. Doing it later needs a pinned container image and probably per-effect tolerances (see #2). Recorded in `fixtures/README.md`.

## Minors accepted as-is

- `vitest.config.ts`'s `exclude` replaces vitest's default list rather than extending it. Inert — the new list keeps `node_modules` and `dist`, and nothing else matches.
- `makeTestImage` bands 2–3 collapse for `height < 4`. All fixtures are 256×256; guarded against divide-by-zero.
- The luminance test samples the R channel only. Bands 1–2 are chromatic, so a G/B-only bug would still fail the goldens.
- The hue band wraps at `u = 1`, repeating the first column's colour. Deterministic and cosmetic.
- PNG round-trip byte-exactness is proven only for opaque pixels. Every shader passes source alpha through and the test image is alpha-255.
