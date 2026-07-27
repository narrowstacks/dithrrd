import { describe, it, expect } from 'vitest'
import { makeTestImage } from '@/testing/testImage'

describe('makeTestImage', () => {
  it('returns an ImageData of the requested size', () => {
    const img = makeTestImage(256, 256)
    expect(img.width).toBe(256)
    expect(img.height).toBe(256)
    expect(img.data.length).toBe(256 * 256 * 4)
  })

  it('is deterministic across calls', () => {
    const a = makeTestImage(64, 64)
    const b = makeTestImage(64, 64)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })

  it('is fully opaque', () => {
    const img = makeTestImage(32, 32)
    for (let p = 0; p < 32 * 32; p++) expect(img.data[p * 4 + 3]).toBe(255)
  })

  it('spans a wide luminance range', () => {
    const img = makeTestImage(256, 256)
    let min = 255
    let max = 0
    for (let p = 0; p < 256 * 256; p++) {
      const v = img.data[p * 4]
      if (v < min) min = v
      if (v > max) max = v
    }
    expect(min).toBeLessThan(16)
    expect(max).toBeGreaterThan(239)
  })
})
