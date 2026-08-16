import { describe, it, expect } from 'vitest'
import { clientToSourcePixel } from '@/features/viewportMath'

describe('clientToSourcePixel', () => {
  const base = { rectLeft: 0, rectTop: 0, width: 100, height: 100 }

  it('maps identity transform 1:1', () => {
    expect(
      clientToSourcePixel({ ...base, clientX: 10, clientY: 20, positionX: 0, positionY: 0, scale: 1 }),
    ).toEqual({ x: 10, y: 20 })
  })

  it('accounts for scale', () => {
    expect(
      clientToSourcePixel({ ...base, clientX: 40, clientY: 40, positionX: 0, positionY: 0, scale: 2 }),
    ).toEqual({ x: 20, y: 20 })
  })

  it('accounts for pan translation', () => {
    expect(
      clientToSourcePixel({ ...base, clientX: 30, clientY: 30, positionX: 10, positionY: 5, scale: 1 }),
    ).toEqual({ x: 20, y: 25 })
  })

  it('returns null outside the image', () => {
    expect(
      clientToSourcePixel({ ...base, clientX: -5, clientY: 10, positionX: 0, positionY: 0, scale: 1 }),
    ).toBeNull()
    expect(
      clientToSourcePixel({ ...base, clientX: 500, clientY: 10, positionX: 0, positionY: 0, scale: 1 }),
    ).toBeNull()
  })
})
