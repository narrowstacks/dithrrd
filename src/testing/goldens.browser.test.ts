import { describe, it, expect } from 'vitest'
import { encodePng, decodePng } from '@/testing/png'
import { compareRgba, MAX_DELTA } from '@/testing/goldens'
import { makeTestImage } from '@/testing/testImage'

describe('png codec', () => {
  it('round-trips RGBA through PNG losslessly', async () => {
    const img = makeTestImage(32, 32)
    const bytes = await encodePng(img.data, 32, 32)
    const back = await decodePng(bytes)
    expect(back.width).toBe(32)
    expect(back.height).toBe(32)
    expect(Array.from(back.data)).toEqual(Array.from(img.data))
  })
})

describe('compareRgba', () => {
  it('reports zero difference for identical buffers', () => {
    const a = makeTestImage(16, 16).data
    const r = compareRgba(a, a.slice())
    expect(r.maxDelta).toBe(0)
    expect(r.diffFraction).toBe(0)
  })

  it('reports the largest per-channel delta', () => {
    const a = new Uint8ClampedArray([10, 10, 10, 255])
    const b = new Uint8ClampedArray([10, 17, 10, 255])
    expect(compareRgba(a, b).maxDelta).toBe(7)
  })

  it('reports the fraction of differing pixels', () => {
    const a = new Uint8ClampedArray(4 * 4)
    const b = new Uint8ClampedArray(4 * 4)
    b[4] = 9
    expect(compareRgba(a, b).diffFraction).toBeCloseTo(0.25, 5)
  })

  it('reports zero badFraction when every channel drifts within tolerance', () => {
    const pixels = 16
    const a = new Uint8ClampedArray(pixels * 4).fill(100)
    const b = new Uint8ClampedArray(pixels * 4).fill(100 + MAX_DELTA)
    const r = compareRgba(a, b)
    expect(r.maxDelta).toBe(MAX_DELTA)
    expect(r.badFraction).toBe(0)
  })

  it('reports a nonzero badFraction for one badly-corrupted pixel among many', () => {
    const pixels = 100
    const a = new Uint8ClampedArray(pixels * 4)
    const b = new Uint8ClampedArray(pixels * 4)
    b[0] = 255 // one channel of the first pixel is wildly off
    const r = compareRgba(a, b)
    expect(r.badFraction).toBeGreaterThan(0)
    expect(r.badFraction).toBeCloseTo(1 / pixels, 10)
  })

  it('reports zero badFraction for identical buffers', () => {
    const a = makeTestImage(16, 16).data
    expect(compareRgba(a, a.slice()).badFraction).toBe(0)
  })
})
