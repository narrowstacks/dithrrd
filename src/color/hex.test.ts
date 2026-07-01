import { describe, it, expect } from 'vitest'
import { hexToRgb01, rgb01ToHex, isValidHex } from '@/color/hex'

describe('hex helpers', () => {
  it('parses #rrggbb and bare rrggbb to 0..1 rgb', () => {
    expect(hexToRgb01('#ffffff')).toEqual([1, 1, 1])
    expect(hexToRgb01('000000')).toEqual([0, 0, 0])
    const [r, g, b] = hexToRgb01('#8bac0f')
    expect(r).toBeCloseTo(0x8b / 255, 5)
    expect(g).toBeCloseTo(0xac / 255, 5)
    expect(b).toBeCloseTo(0x0f / 255, 5)
  })
  it('is case-insensitive', () => {
    expect(hexToRgb01('#8BAC0F')).toEqual(hexToRgb01('#8bac0f'))
  })
  it('throws on invalid hex', () => {
    expect(() => hexToRgb01('xyz')).toThrow()
    expect(() => hexToRgb01('#fff')).toThrow() // 3-digit shorthand not supported
  })
  it('formats rgb01 back to lowercase #rrggbb, clamping out-of-range', () => {
    expect(rgb01ToHex([1, 1, 1])).toBe('#ffffff')
    expect(rgb01ToHex([0, 0, 0])).toBe('#000000')
    expect(rgb01ToHex([-0.5, 0.5, 2])).toBe('#0080ff')
  })
  it('round-trips', () => {
    expect(rgb01ToHex(hexToRgb01('#306230'))).toBe('#306230')
  })
  it('validates', () => {
    expect(isValidHex('#abcdef')).toBe(true)
    expect(isValidHex('ABCDEF')).toBe(true)
    expect(isValidHex('#abc')).toBe(false)
    expect(isValidHex('nope')).toBe(false)
  })
})
