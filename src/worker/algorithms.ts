function quantize(value: number, levels: number): number {
  const L = Math.max(2, Math.floor(levels))
  const step = 255 / (L - 1)
  return Math.round(Math.round(value / step) * step)
}

export function floydSteinberg(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  params: { levels: number; serpentine: boolean },
): void {
  const { levels, serpentine } = params
  // Work in a Float array to accumulate error beyond 0..255 clamping.
  const f = new Float32Array(width * height * 3)
  for (let p = 0; p < width * height; p++) {
    for (let c = 0; c < 3; c++) f[p * 3 + c] = buf[p * 4 + c]
  }

  const add = (x: number, y: number, c: number, err: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    f[(y * width + x) * 3 + c] += err
  }

  for (let y = 0; y < height; y++) {
    const ltr = !serpentine || y % 2 === 0
    for (let i = 0; i < width; i++) {
      const x = ltr ? i : width - 1 - i
      const dir = ltr ? 1 : -1
      for (let c = 0; c < 3; c++) {
        const old = f[(y * width + x) * 3 + c]
        const nw = quantize(old, levels)
        const err = old - nw
        f[(y * width + x) * 3 + c] = nw
        add(x + dir, y, c, (err * 7) / 16)
        add(x - dir, y + 1, c, (err * 3) / 16)
        add(x, y + 1, c, (err * 5) / 16)
        add(x + dir, y + 1, c, (err * 1) / 16)
      }
    }
  }

  for (let p = 0; p < width * height; p++) {
    for (let c = 0; c < 3; c++) buf[p * 4 + c] = f[p * 3 + c]
    // alpha (index 3) left untouched
  }
}

export interface DiffusionKernel {
  divisor: number
  cells: { dx: number; dy: number; w: number }[]
}

/**
 * Kernel-parameterized error diffusion. Same structure as `floydSteinberg`:
 * accumulate error in a Float array, quantize left-to-right (or serpentine),
 * and spread the residual to `kernel.cells`. `dx` is mirrored by scan direction
 * so serpentine rows diffuse symmetrically. Alpha (index 3) is never touched.
 */
export function diffuse(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  params: { levels: number; serpentine: boolean },
  kernel: DiffusionKernel,
): void {
  const { levels, serpentine } = params
  const { divisor, cells } = kernel
  const f = new Float32Array(width * height * 3)
  for (let p = 0; p < width * height; p++) {
    for (let c = 0; c < 3; c++) f[p * 3 + c] = buf[p * 4 + c]
  }

  const add = (x: number, y: number, c: number, err: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    f[(y * width + x) * 3 + c] += err
  }

  for (let y = 0; y < height; y++) {
    const ltr = !serpentine || y % 2 === 0
    for (let i = 0; i < width; i++) {
      const x = ltr ? i : width - 1 - i
      const dir = ltr ? 1 : -1
      for (let c = 0; c < 3; c++) {
        const old = f[(y * width + x) * 3 + c]
        const nw = quantize(old, levels)
        const err = old - nw
        f[(y * width + x) * 3 + c] = nw
        for (const cell of cells) {
          add(x + dir * cell.dx, y + cell.dy, c, (err * cell.w) / divisor)
        }
      }
    }
  }

  for (let p = 0; p < width * height; p++) {
    for (let c = 0; c < 3; c++) buf[p * 4 + c] = f[p * 3 + c]
    // alpha (index 3) left untouched
  }
}

/**
 * Error-diffusion kernels keyed by effect `type`. The worker registers one
 * handler per entry, and each effect module references its kernel by name.
 * `divisor` may exceed the sum of weights (Atkinson) to intentionally lose error.
 */
export const KERNELS: Record<string, DiffusionKernel> = {
  atkinson: {
    divisor: 8,
    cells: [
      { dx: 1, dy: 0, w: 1 },
      { dx: 2, dy: 0, w: 1 },
      { dx: -1, dy: 1, w: 1 },
      { dx: 0, dy: 1, w: 1 },
      { dx: 1, dy: 1, w: 1 },
      { dx: 0, dy: 2, w: 1 },
    ],
  },
  jarvis: {
    divisor: 48,
    cells: [
      { dx: 1, dy: 0, w: 7 }, { dx: 2, dy: 0, w: 5 },
      { dx: -2, dy: 1, w: 3 }, { dx: -1, dy: 1, w: 5 }, { dx: 0, dy: 1, w: 7 }, { dx: 1, dy: 1, w: 5 }, { dx: 2, dy: 1, w: 3 },
      { dx: -2, dy: 2, w: 1 }, { dx: -1, dy: 2, w: 3 }, { dx: 0, dy: 2, w: 5 }, { dx: 1, dy: 2, w: 3 }, { dx: 2, dy: 2, w: 1 },
    ],
  },
  stucki: {
    divisor: 42,
    cells: [
      { dx: 1, dy: 0, w: 8 }, { dx: 2, dy: 0, w: 4 },
      { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 8 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 },
      { dx: -2, dy: 2, w: 1 }, { dx: -1, dy: 2, w: 2 }, { dx: 0, dy: 2, w: 4 }, { dx: 1, dy: 2, w: 2 }, { dx: 2, dy: 2, w: 1 },
    ],
  },
  sierra: {
    divisor: 32,
    cells: [
      { dx: 1, dy: 0, w: 5 }, { dx: 2, dy: 0, w: 3 },
      { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 5 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 },
      { dx: -1, dy: 2, w: 2 }, { dx: 0, dy: 2, w: 3 }, { dx: 1, dy: 2, w: 2 },
    ],
  },
  burkes: {
    divisor: 32,
    cells: [
      { dx: 1, dy: 0, w: 8 }, { dx: 2, dy: 0, w: 4 },
      { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 8 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 },
    ],
  },
}
