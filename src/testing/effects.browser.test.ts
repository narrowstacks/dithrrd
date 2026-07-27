import { describe, it } from 'vitest'
import { EFFECT_LIST } from '@/effects/registry'
import type { Params } from '@/effects/types'
import { makeTestImage } from '@/testing/testImage'
import { renderStack } from '@/testing/renderStack'
import { assertGolden } from '@/testing/goldens'
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
      await assertGolden(`${effect.type}-default`, out, SIZE, SIZE)
    })
  }
})
