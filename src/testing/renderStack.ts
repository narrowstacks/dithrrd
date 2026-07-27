import { createReglBackend } from '@/engine/backend'
import { execute } from '@/engine/execute'
import { planPasses, type StackNode } from '@/engine/planPasses'
import { registry } from '@/effects/registry'
import type { Palette, Params } from '@/effects/types'
import type { RunCpu } from '@/worker/runCpu'

/** Runs CPU effects in-process. The worker path needs a live Worker and warms up async. */
const runCpuInline: RunCpu = async (
  type: string,
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  params: Params,
) => {
  const effect = registry[type]
  if (!effect || effect.kind !== 'cpu') throw new Error(`not a cpu effect: ${type}`)
  const copy = buf.slice()
  effect.process(copy, width, height, params)
  return copy
}

/** Flip RGBA rows in place-ish: regl.read returns bottom-up, ImageData is top-down. */
function flipRows(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const stride = width * 4
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * stride
    out.set(data.subarray(src, src + stride), y * stride)
  }
  return out
}

/**
 * Render `stack` over `source` through the real WebGL2 pipeline.
 * Returns RGBA bytes in top-down row order, matching the input ImageData.
 */
export async function renderStack(
  source: ImageData,
  stack: StackNode[],
  palettes: Record<string, Palette>,
): Promise<Uint8ClampedArray> {
  const { width, height } = source
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const backend = createReglBackend(canvas, source, width, height)
  try {
    const steps = planPasses(stack, registry)
    const tex = await execute(steps, backend, { runCpu: runCpuInline, palettes })
    const { data } = backend.readback(tex)
    return flipRows(data, width, height)
  } finally {
    backend.dispose()
  }
}
