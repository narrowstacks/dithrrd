# Golden fixtures

This directory holds 18 committed PNG goldens: one per effect (`<effect>-default.png`)
plus two multi-effect stacks (`stack-gpu-cpu-gpu.png`, `stack-grade-bayer.png`). They
are the correctness oracle for this app's dithering/halftone/palette effects, rendered
through the real WebGL2 pipeline. Their purpose is broader than regression-catching in
this repo: they are also the intended reference output for a planned native Metal port
of the same effects, so a from-scratch Metal implementation can be checked pixel-for-pixel
against known-good web output instead of only "looks right."

## Regenerating

```
VITE_UPDATE_GOLDENS=1 npm run test:browser
```

This overwrites every golden with fresh output. Only do this deliberately — see the
stability caveat below before regenerating on a different machine.

## How comparison works

`src/testing/goldens.ts` compares rendered output to the stored PNG per pixel, per
channel:

- A pixel is **bad** if any RGBA channel differs from the golden by more than
  `MAX_DELTA` (2).
- A golden **fails** the test if the fraction of bad pixels exceeds
  `MAX_DIFF_FRACTION` (0.001).

## Scan order (read this before porting error diffusion to Metal)

The six error-diffusion effects (floyd, atkinson, burkes, jarvis, sierra, stucki) and
the `stack-gpu-cpu-gpu` fixture were generated with the CPU diffusion loop scanning
rows in **GL order: image-bottom-to-top**, with serpentine row parity inverted
accordingly relative to image row index.

This falls out of the pipeline, not a deliberate design choice for the test harness:
`src/engine/backend.ts` uploads the source texture with `flipY: true`; `readback` uses
`regl.read`, which returns rows bottom-up; `uploadPixels` re-uploads CPU output with
`flipY: false`; and `src/testing/renderStack.ts` only flips rows to top-down at the very
end, after every effect (GPU or CPU) has run. So a CPU effect sitting anywhere in the
stack sees and produces bottom-up rows — exactly what `src/engine/execute.ts` does in
production. The goldens are correct as-is; they simply encode a bottom-up scan.

A Metal port that runs a naive top-down diffusion loop will not match these goldens
even with an otherwise-correct implementation. It needs to either scan bottom-up to
match, or flip input/output rows to compensate, and get serpentine parity right for
whichever direction it picks. See the comment on `flipRows` in
`src/testing/renderStack.ts` for the same explanation next to the code.

## Provenance

Generated on:

- **OS**: macOS 27.0 (build 26A5378n)
- **GPU**: Apple M4 (integrated, Metal 4)
- **Browser**: Playwright-managed Chromium, Playwright version 1.62.0 (run
  `pnpm exec playwright --version` to check the Playwright version on a given machine;
  the bundled Chromium build version can be found with
  `pnpm exec playwright install --dry-run` or in
  `node_modules/playwright-core/browsers.json`)

These fixtures reflect that GPU vendor's ANGLE/Metal rendering behavior. See below for
why that matters.

## Cross-hardware stability caveat

These are GPU rasterization outputs, not deterministic CPU math (aside from the CPU
diffusion effects, which are deterministic but still start from a GPU-rendered/read-back
source). They are **not guaranteed bit-stable across GPU vendors or driver versions**,
even though the `MAX_DELTA`/`MAX_DIFF_FRACTION` gate gives a little headroom.

- **`perChannel` is the least reproducible effect here.** Its shader (`src/effects/
  perChannel.ts`) applies `floor()` to pixel coordinates rotated by 15°/75° at unit
  pitch (`uScale = 1` by default), over a 256x256 test image whose rotated coordinates
  reach roughly the image diagonal, ~362px. At that scale, a `sin`/`cos` difference on
  the order of 1e-5 between GPU implementations is enough to flip which side of a
  `floor()` boundary a pixel lands on — and because this repeats across the whole
  image, a tiny per-pixel trig discrepancy can flip several hundred pixels, which is
  enough to exceed the 0.001 bad-pixel-fraction gate.
- **`halftone` has far more margin.** Its cell pitch defaults to 8px (`cellSize: 8`),
  so the same order of trig error only rarely pushes a pixel across a cell boundary.

Practical implications:

- Regenerating goldens on the **same GPU vendor** (e.g. another Apple Silicon Mac) is
  expected to reproduce these outputs within tolerance.
- Regenerating on a **different GPU vendor** (Intel, AMD, NVIDIA, or a software
  rasterizer) may require regenerating the goldens on that hardware, and possibly
  per-effect tolerances for effects like `perChannel` that sit close to the edge.

## Why there is no CI job for this suite

Linux CI runners typically render via SwiftShader or Mesa software/virtual GPU paths,
which will not reproduce macOS ANGLE/Metal output at the pixel level. Wiring
`npm run test:browser` into CI as-is today would produce a red suite on every run, not
useful signal. Doing this properly later needs a pinned container image with a
consistent GPU/driver stack, and probably per-effect tolerances (see `perChannel`
above) rather than one global `MAX_DIFF_FRACTION`.
