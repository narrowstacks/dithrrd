import { describe, it, expect } from 'vitest'
import { encodePng, decodePng } from '@/testing/png'
import { compareRgba } from '@/testing/goldens'
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
})
