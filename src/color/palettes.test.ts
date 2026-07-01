import { describe, it, expect } from 'vitest'
import { PALETTES, nearestColor } from '@/color/palettes'

describe('PALETTES', () => {
  it('includes bw, gray4, and gameboy with valid 0..1 colors', () => {
    for (const id of ['bw', 'gray4', 'gameboy']) {
      const p = PALETTES[id]
      expect(p, id).toBeTruthy()
      expect(p.colors.length).toBeGreaterThan(0)
      for (const c of p.colors) {
        expect(c).toHaveLength(3)
        for (const v of c) expect(v >= 0 && v <= 1).toBe(true)
      }
    }
  })
})

describe('nearestColor', () => {
  const p = { id: 't', name: 't', colors: [[0, 0, 0], [1, 1, 1]] as [number, number, number][] }
  it('snaps a dark color to black', () => {
    expect(nearestColor([0.1, 0.1, 0.1], p)).toEqual([0, 0, 0])
  })
  it('snaps a light color to white', () => {
    expect(nearestColor([0.9, 0.9, 0.9], p)).toEqual([1, 1, 1])
  })
})
