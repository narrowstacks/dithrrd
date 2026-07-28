/**
 * Deterministic source image for golden fixtures. Four horizontal bands, each
 * exercising a different effect family:
 *   0: smooth grayscale ramp   — levels quantization, banding
 *   1: saturated hue sweep     — palette mapping, duotone
 *   2: diagonal luminance ramp — ordered dither, error diffusion
 *   3: hard checkerboard       — pixelate, halftone, crosshatch
 * No randomness: the same bytes on every platform and in every language.
 */
export function makeTestImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  const band = Math.max(1, Math.floor(height / 4))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const u = width === 1 ? 0 : x / (width - 1)
      const v = height === 1 ? 0 : y / (height - 1)
      let r = 0
      let g = 0
      let b = 0

      switch (Math.min(3, Math.floor(y / band))) {
        case 0: {
          const l = Math.round(u * 255)
          r = l
          g = l
          b = l
          break
        }
        case 1: {
          const rgb = hueToRgb(u)
          r = rgb[0]
          g = rgb[1]
          b = rgb[2]
          break
        }
        case 2: {
          const l = Math.round(((u + v) / 2) * 255)
          r = l
          g = Math.round(l * 0.6)
          b = Math.round(255 - l * 0.8)
          break
        }
        default: {
          const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0
          r = on ? 245 : 10
          g = on ? 245 : 10
          b = on ? 245 : 10
        }
      }

      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }

  return new ImageData(data, width, height)
}

/** Fully-saturated, full-value hue at position `t` in [0,1). */
function hueToRgb(t: number): [number, number, number] {
  const h = (t % 1) * 6
  const s = Math.floor(h)
  const f = h - s
  const q = Math.round(255 * (1 - f))
  const w = Math.round(255 * f)
  switch (s % 6) {
    case 0: return [255, w, 0]
    case 1: return [q, 255, 0]
    case 2: return [0, 255, w]
    case 3: return [0, q, 255]
    case 4: return [w, 0, 255]
    default: return [255, 0, q]
  }
}
