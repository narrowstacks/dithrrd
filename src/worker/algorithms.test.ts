import { describe, it, expect } from 'vitest'
import { floydSteinberg } from '@/worker/algorithms'

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
