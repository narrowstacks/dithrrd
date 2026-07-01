import { describe, it, expect } from 'vitest'
import { floydSteinberg, diffuse, KERNELS, type DiffusionKernel } from '@/worker/algorithms'

function gray(v: number): Uint8ClampedArray {
  return new Uint8ClampedArray([v, v, v, 255])
}

describe('floydSteinberg', () => {
  it('snaps a single mid-gray pixel to black or white at 2 levels', () => {
    const buf = gray(100)
    floydSteinberg(buf, 1, 1, { levels: 2, serpentine: false })
    expect([0, 255]).toContain(buf[0])
    expect(buf[0]).toBe(buf[1])
    expect(buf[1]).toBe(buf[2])
    expect(buf[3]).toBe(255) // alpha untouched
  })

  it('leaves pure black and pure white unchanged at 2 levels', () => {
    const black = gray(0)
    floydSteinberg(black, 1, 1, { levels: 2, serpentine: false })
    expect(black[0]).toBe(0)
    const white = gray(255)
    floydSteinberg(white, 1, 1, { levels: 2, serpentine: false })
    expect(white[0]).toBe(255)
  })

  it('diffuses error to the neighbor to the right', () => {
    // Two gray pixels just below the 127.5 rounding midpoint. The first rounds
    // to 0 (err +127 -> mostly right), pushing the right pixel brighter so it
    // rounds to 255. (127 not 128: 128/255 rounds UP to white, which would invert this.)
    const buf = new Uint8ClampedArray([127, 127, 127, 255, 127, 127, 127, 255])
    floydSteinberg(buf, 2, 1, { levels: 2, serpentine: false })
    expect(buf[0]).toBe(0)
    expect(buf[4]).toBe(255)
  })
})

const FS_KERNEL: DiffusionKernel = {
  divisor: 16,
  cells: [
    { dx: 1, dy: 0, w: 7 },
    { dx: -1, dy: 1, w: 3 },
    { dx: 0, dy: 1, w: 5 },
    { dx: 1, dy: 1, w: 1 },
  ],
}

function ramp(w: number, h: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const v = (i * 37) % 256
    buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = v
    buf[i * 4 + 3] = 255
  }
  return buf
}

describe('diffuse (generic engine)', () => {
  it('with the Floyd–Steinberg kernel matches floydSteinberg byte-for-byte', () => {
    const w = 4, h = 4
    const a = ramp(w, h)
    const b = ramp(w, h)
    floydSteinberg(a, w, h, { levels: 2, serpentine: true })
    diffuse(b, w, h, { levels: 2, serpentine: true }, FS_KERNEL)
    expect(Array.from(b)).toEqual(Array.from(a))
  })

  it('leaves alpha untouched', () => {
    const buf = new Uint8ClampedArray([100, 100, 100, 128])
    diffuse(buf, 1, 1, { levels: 2, serpentine: false }, KERNELS.atkinson)
    expect(buf[3]).toBe(128)
  })
})
