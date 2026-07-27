import { describe, it, expect } from 'vitest'
import { EFFECT_LIST } from '@/effects/registry'
import type { Params } from '@/effects/types'
import { makeTestImage } from '@/testing/testImage'
import { renderStack } from '@/testing/renderStack'
import { assertGolden, compareRgba } from '@/testing/goldens'
import { PALETTES } from '@/color/palettes'

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
