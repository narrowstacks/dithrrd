import { expect } from 'vitest'
import { commands } from '@vitest/browser/context'
import { encodePng, decodePng } from '@/testing/png'

/** Tolerances: GPU output is not bit-stable across drivers. */
export const MAX_DELTA = 2
export const MAX_DIFF_FRACTION = 0.001

export function compareRgba(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
): { maxDelta: number; diffFraction: number; badFraction: number } {
  if (a.length !== b.length) throw new Error(`length mismatch: ${a.length} vs ${b.length}`)
  let maxDelta = 0
  let differing = 0
  let bad = 0
  const pixels = a.length / 4
  for (let p = 0; p < pixels; p++) {
    let pixelDiffers = false
    let pixelBad = false
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(a[p * 4 + c] - b[p * 4 + c])
      if (d > maxDelta) maxDelta = d
      if (d > 0) pixelDiffers = true
      if (d > MAX_DELTA) pixelBad = true
    }
    if (pixelDiffers) differing++
    if (pixelBad) bad++
  }
  return {
    maxDelta,
    diffFraction: pixels === 0 ? 0 : differing / pixels,
    badFraction: pixels === 0 ? 0 : bad / pixels,
  }
}

export async function assertGolden(
  name: string,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<void> {
  const png = await encodePng(rgba, width, height)

  if (import.meta.env.VITE_UPDATE_GOLDENS) {
    let binary = ''
    for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i])
    await commands.writeGolden(name, btoa(binary))
    return
  }

  const res = await fetch(`/fixtures/${name}.png`)
  if (!res.ok) {
    throw new Error(
      `missing golden "${name}". Regenerate with: VITE_UPDATE_GOLDENS=1 npm run test:browser`,
    )
  }
  const golden = await decodePng(new Uint8Array(await res.arrayBuffer()))
  expect(golden.width).toBe(width)
  expect(golden.height).toBe(height)

  const { maxDelta, diffFraction, badFraction } = compareRgba(golden.data, rgba)
  expect(
    badFraction <= MAX_DIFF_FRACTION,
    `golden "${name}" drifted: badFraction=${badFraction.toFixed(5)} ` +
      `(limit ${MAX_DIFF_FRACTION}), maxDelta=${maxDelta}, diffFraction=${diffFraction.toFixed(5)}`,
  ).toBe(true)
}
