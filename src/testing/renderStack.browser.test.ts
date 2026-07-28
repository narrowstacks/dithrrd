import { describe, it, expect } from 'vitest'
import { makeTestImage } from '@/testing/testImage'
import { renderStack } from '@/testing/renderStack'
import { PALETTES } from '@/color/palettes'

describe('renderStack', () => {
  it('returns the source unchanged for an empty stack', async () => {
    const src = makeTestImage(64, 64)
    const out = await renderStack(src, [], PALETTES)
    expect(out.length).toBe(src.data.length)
    for (let i = 0; i < out.length; i++) {
      expect(Math.abs(out[i] - src.data[i])).toBeLessThanOrEqual(1)
    }
  })

  it('skips disabled nodes', async () => {
    const src = makeTestImage(64, 64)
    const off = await renderStack(
      src,
      [{ id: 'a', type: 'bayer', enabled: false, params: { matrix: '4', levels: 2 } }],
      PALETTES,
    )
    for (let i = 0; i < off.length; i++) {
      expect(Math.abs(off[i] - src.data[i])).toBeLessThanOrEqual(1)
    }
  })

  it('runs a GPU effect and changes pixels', async () => {
    const src = makeTestImage(64, 64)
    const out = await renderStack(
      src,
      [{ id: 'a', type: 'bayer', enabled: true, params: { matrix: '4', levels: 2 } }],
      PALETTES,
    )
    let changed = 0
    for (let i = 0; i < out.length; i += 4) if (out[i] !== src.data[i]) changed++
    expect(changed).toBeGreaterThan(0)
  })

  it('runs a CPU diffusion effect and changes pixels', async () => {
    const src = makeTestImage(64, 64)
    const out = await renderStack(
      src,
      [{ id: 'a', type: 'atkinson', enabled: true, params: { levels: 2, serpentine: true } }],
      PALETTES,
    )
    let changed = 0
    for (let i = 0; i < out.length; i += 4) if (out[i] !== src.data[i]) changed++
    expect(changed).toBeGreaterThan(0)
  })
})
