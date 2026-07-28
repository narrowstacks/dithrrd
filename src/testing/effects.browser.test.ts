import { describe, it, expect } from 'vitest'
import { EFFECT_LIST } from '@/effects/registry'
import type { Params } from '@/effects/types'
import { makeTestImage } from '@/testing/testImage'
import { renderStack } from '@/testing/renderStack'
import { assertGolden, compareRgba } from '@/testing/goldens'
import { PALETTES } from '@/color/palettes'
import type { StackNode } from '@/engine/planPasses'

const SIZE = 256

/**
 * Effects whose defaultParams are an identity transform, and would therefore
 * produce a golden that cannot fail. Only `grade` qualifies today.
 */
const OVERRIDES: Record<string, Params> = {
  grade: { brightness: 0.15, contrast: 1.4, gamma: 0.8, saturation: 1.6 },
}

function goldenParams(type: string): Params {
  const effect = EFFECT_LIST.find((e) => e.type === type)
  if (!effect) throw new Error(`unknown effect: ${type}`)
  return OVERRIDES[type] ?? effect.defaultParams
}

describe('effect goldens', () => {
  for (const effect of EFFECT_LIST) {
    it(`${effect.type} matches its golden`, async () => {
      const src = makeTestImage(SIZE, SIZE)
      const out = await renderStack(
        src,
        [{ id: 'a', type: effect.type, enabled: true, params: goldenParams(effect.type) }],
        PALETTES,
      )

      // An effect that silently no-ops would otherwise be captured as its own
      // golden and pass forever. Require real change against the source.
      const vsSource = compareRgba(src.data, out)
      expect(vsSource.diffFraction).toBeGreaterThan(0.05)

      await assertGolden(`${effect.type}-default`, out, SIZE, SIZE)
    })
  }
})

const STACKS: { name: string; stack: StackNode[] }[] = [
  {
    name: 'stack-grade-bayer',
    stack: [
      { id: 'a', type: 'grade', enabled: true, params: goldenParams('grade') },
      { id: 'b', type: 'bayer', enabled: true, params: { matrix: '8', levels: 3 } },
    ],
  },
  {
    name: 'stack-gpu-cpu-gpu',
    stack: [
      {
        id: 'a',
        type: 'pixelate',
        enabled: true,
        params: { pixelSize: 8, levels: 4, sampling: 'nearest', dither: false },
      },
      { id: 'b', type: 'floyd', enabled: true, params: { levels: 2, serpentine: true } },
      { id: 'c', type: 'duotone', enabled: true, params: { paletteId: 'gameboy' } },
    ],
  },
]

describe('stack goldens', () => {
  for (const { name, stack } of STACKS) {
    it(`${name} matches its golden`, async () => {
      const src = makeTestImage(SIZE, SIZE)
      const out = await renderStack(src, stack, PALETTES)

      // A stack that silently returned the source would otherwise be captured
      // as its own fixture and pass forever. Require real change against the source.
      const vsSource = compareRgba(src.data, out)
      expect(vsSource.diffFraction).toBeGreaterThan(0.05)

      await assertGolden(name, out, SIZE, SIZE)
    })
  }
})

/**
 * Every effect whose defaultParams includes `levels`. Today the only verified
 * point per effect is `levels: 2` (defaults), yet the UI exposes levels 2-8.
 * These add a second verified point at `levels: 3`, built from each effect's
 * own defaultParams with only `levels` overridden — every other param stays
 * canonical and is read from the registry, never hardcoded here.
 */
const LEVELS3_EFFECTS = [
  'atkinson',
  'bayer',
  'burkes',
  'clusteredDot',
  'floyd',
  'jarvis',
  'perChannel',
  'sierra',
  'stucki',
  'pixelate',
]

describe('levels-3 goldens', () => {
  for (const type of LEVELS3_EFFECTS) {
    it(`${type} levels:3 matches its golden`, async () => {
      const effect = EFFECT_LIST.find((e) => e.type === type)
      if (!effect) throw new Error(`unknown effect: ${type}`)
      const params: Params = { ...effect.defaultParams, levels: 3 }

      const src = makeTestImage(SIZE, SIZE)
      const out = await renderStack(
        src,
        [{ id: 'a', type, enabled: true, params }],
        PALETTES,
      )

      // Same no-op guard as the default-params goldens: an effect (or a
      // levels override) that silently does nothing must not be captured as
      // its own golden.
      const vsSource = compareRgba(src.data, out)
      expect(vsSource.diffFraction).toBeGreaterThan(0.05)

      await assertGolden(`${type}-levels3`, out, SIZE, SIZE)
    })
  }

  // bayer's defaultParams use the 4x4 matrix ('4'), so the `uMatrix > 7.0`
  // branch and the entire BAYER8 table have never been exercised by any
  // golden. levels:2 matches the default so this isolates the matrix change.
  it('bayer matrix:8 matches its golden', async () => {
    const src = makeTestImage(SIZE, SIZE)
    const out = await renderStack(
      src,
      [{ id: 'a', type: 'bayer', enabled: true, params: { matrix: '8', levels: 2 } }],
      PALETTES,
    )

    const vsSource = compareRgba(src.data, out)
    expect(vsSource.diffFraction).toBeGreaterThan(0.05)

    await assertGolden('bayer-matrix8', out, SIZE, SIZE)
  })
})
