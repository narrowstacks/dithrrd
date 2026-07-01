import type { Backend } from '@/engine/backend'
import type { StackNode } from '@/engine/planPasses'
import type { Palette } from '@/effects/types'
import type { RunCpu } from '@/worker/runCpu'
import { planPasses } from '@/engine/planPasses'
import { execute } from '@/engine/execute'
import { registry } from '@/effects/registry'

export function flipY(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length)
  const rowBytes = width * 4
  for (let y = 0; y < height; y++) {
    const src = y * rowBytes
    const dst = (height - 1 - y) * rowBytes
    out.set(data.subarray(src, src + rowBytes), dst)
  }
  return out
}

export async function pixelsToPngBlob(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  // NOTE(types): lib.dom's ImageData constructor wants Uint8ClampedArray<ArrayBuffer>
  // specifically, but our Uint8ClampedArray values (from readback/flipY) are typed
  // with the default ArrayBufferLike generic. Runtime bytes are identical; assert the
  // narrower type rather than threading a generic through every producer.
  ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
}

export async function exportCurrentPng(
  backend: Backend,
  stack: StackNode[],
  palettes: Record<string, Palette>,
  runCpu: RunCpu,
): Promise<void> {
  const steps = planPasses(stack, registry)
  // Reuse the engine's render loop; execute() returns the final texture (does not present).
  const finalTex = await execute(steps, backend, { runCpu, palettes })

  const [width, height] = backend.size()
  const { data } = backend.readback(finalTex)
  const flipped = flipY(data, width, height)
  const blob = await pixelsToPngBlob(flipped, width, height)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'dithrrd.png'
  a.click()
  URL.revokeObjectURL(url)
}
