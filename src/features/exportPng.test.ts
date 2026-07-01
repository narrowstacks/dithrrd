import { describe, it, expect } from 'vitest'
import { flipY } from '@/features/exportPng'

describe('flipY', () => {
  it('reverses row order of an RGBA buffer', () => {
    // 1x2 image: row0 = red, row1 = green
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
    const out = flipY(data, 1, 2)
    expect(Array.from(out)).toEqual([0, 255, 0, 255, 255, 0, 0, 255])
  })
})
