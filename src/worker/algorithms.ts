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
